package service

import (
	"context"
	"errors"
	"log/slog"
	"net/url"
	"strings"
	"time"

	"github.com/elvinrodrigues/url-shortener/internal/ctxlog"
	"github.com/elvinrodrigues/url-shortener/internal/domain"
	"github.com/elvinrodrigues/url-shortener/internal/shortcode"
	"golang.org/x/sync/singleflight"
)

const (
	// negativeCacheValue marks a short code as known-missing. Without it every probe
	// for a nonexistent code reaches Postgres, so a scanner walking the key space can
	// drive one DB query per request straight past the cache.
	negativeCacheValue = "\x00:notfound"
	// negativeCacheTTL is deliberately short: a miss can be invalidated by a create,
	// and a stale negative entry is more harmful than a stale positive one.
	negativeCacheTTL = 60 * time.Second

	dbReadTimeout     = 5 * time.Second
	backgroundTimeout = 3 * time.Second

	// guestAliasQuarantine is how long an expired guest alias stays locked before
	// anyone else may claim it.
	//
	// Recycling an alias the moment it expires makes a shortener a phishing
	// primitive: a guest link shared in a forum post, a QR code, or print outlives
	// its 30-day cap, and whoever claims the freed alias inherits every reader who
	// still holds the old URL. Expired links already answer 410 Gone, so there is
	// no urgency in reclaiming them — the delay costs only alias-space reuse and
	// buys the time for casually shared links to go cold.
	guestAliasQuarantine = 30 * 24 * time.Hour
)

type urlService struct {
	repo  domain.URLRepository
	cache domain.URLCache
	sf    singleflight.Group
}

func New(r domain.URLRepository, c domain.URLCache) domain.URLService {
	return &urlService{repo: r, cache: c}
}

// cacheSet writes through to the cache on a best-effort basis. Cache failures are
// logged but never surfaced: the caller already holds the authoritative DB result.
func (s *urlService) cacheSet(ctx context.Context, logger *slog.Logger, code, value string, ttl time.Duration) {
	setCtx, cancel := context.WithTimeout(ctx, backgroundTimeout)
	defer cancel()

	if err := s.cache.Set(setCtx, code, value, ttl); err != nil {
		logger.Warn("failed to set cache", "code", code, "error", err)
	}
}

// cacheDelete evicts a key on a best-effort basis, detached from the caller's
// cancellation so a client disconnect cannot leave a stale entry behind.
func (s *urlService) cacheDelete(ctx context.Context, logger *slog.Logger, code string) {
	delCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), backgroundTimeout)
	defer cancel()

	if err := s.cache.Delete(delCtx, code); err != nil {
		logger.Warn("cache delete failed", "code", code, "error", err)
	}
}

// incrementClicksAsync detaches the click counter from the redirect's critical path.
// The logger is captured by the caller rather than re-derived inside the goroutine:
// the background context carries no request-scoped values, so looking it up there
// would always fall back to the default logger and drop the request_id.
func (s *urlService) incrementClicksAsync(logger *slog.Logger, code string) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), backgroundTimeout)
		defer cancel()

		if err := s.repo.IncrementClicks(ctx, code); err != nil {
			logger.Error("async click increment failed", "code", code, "error", err)
		}
	}()
}

// reclaimExpiredGuestAlias tries to free an alias held by a long-expired guest
// link and create the caller's link in its place.
//
// It returns (nil, nil) when the alias is not eligible, leaving the caller's
// original ErrURLDuplicate to stand. Two conditions gate eligibility, and both
// exist to keep alias reuse from becoming a link-hijacking vector:
//
//  1. The caller must be signed in. A guest cannot reclaim, so every reclamation
//     is attributable to an account and an abusive one can be traced and revoked.
//     This does not stop a determined attacker — they can register — but it
//     removes the anonymous, zero-cost path.
//  2. The old link must have expired longer ago than guestAliasQuarantine.
//
// The reclaim is deliberately not transactional. It is one conditional UPDATE
// followed by one INSERT; if another request wins the race the INSERT simply
// returns ErrURLDuplicate and the caller's retry loop handles it. Nothing is
// corrupted — the only residue is an already-expired guest link left
// deactivated, which is the desired end state regardless.
func (s *urlService) reclaimExpiredGuestAlias(ctx context.Context, logger *slog.Logger, req *domain.CreateURLRequest, code string) (*domain.URL, error) {
	if req.UserID == nil {
		return nil, nil
	}

	recycled, err := s.repo.RecycleExpiredGuestCode(ctx, code, time.Now().Add(-guestAliasQuarantine))
	if err != nil {
		return nil, err
	}
	if !recycled {
		return nil, nil
	}

	url, err := s.repo.Create(ctx, req, code)
	if err != nil {
		return nil, err
	}

	logger.Info("reclaimed expired guest alias", "code", code, "user_id", *req.UserID)
	s.cacheDelete(ctx, logger, url.ShortCode)
	return url, nil
}

func (s *urlService) Shorten(ctx context.Context, req domain.CreateURLRequest) (*domain.URL, error) {
	logger := ctxlog.GetLogger(ctx, slog.Default())

	if err := validateURL(req.LongURL); err != nil {
		return nil, err
	}

	// For guest users (unauthenticated), enforce a maximum lifetime limit of 1 month (30 days)
	if req.UserID == nil {
		maxGuestExpiry := time.Now().AddDate(0, 1, 0)
		if req.ExpiresAt == nil || req.ExpiresAt.After(maxGuestExpiry) {
			req.ExpiresAt = &maxGuestExpiry
		}
	}

	if req.CustomCode != "" {
		if err := validateCustomCode(req.CustomCode); err != nil {
			return nil, err
		}
		url, err := s.repo.Create(ctx, &req, req.CustomCode)
		if err != nil {
			if errors.Is(err, domain.ErrURLDuplicate) {
				reclaimed, rerr := s.reclaimExpiredGuestAlias(ctx, logger, &req, req.CustomCode)
				if rerr != nil {
					return nil, rerr
				}
				if reclaimed != nil {
					return reclaimed, nil
				}
			}
			return nil, err
		}
		// A custom alias may have been probed (and negatively cached) before it
		// existed. Evict synchronously so the new link is never shadowed by a 404.
		s.cacheDelete(ctx, logger, url.ShortCode)
		return url, nil
	}

	const maxRetries = 5
	codeLen := 7

	for attempt := 1; attempt <= maxRetries; attempt++ {
		if attempt > 2 {
			codeLen = 8
		}
		code, err := shortcode.Generate(codeLen)
		if err != nil {
			return nil, err
		}
		if reservedCodes[strings.ToLower(code)] {
			continue
		}

		url, err := s.repo.Create(ctx, &req, code)
		if err != nil {
			if !errors.Is(err, domain.ErrURLDuplicate) {
				return nil, err
			}
			reclaimed, rerr := s.reclaimExpiredGuestAlias(ctx, logger, &req, code)
			if rerr != nil && !errors.Is(rerr, domain.ErrURLDuplicate) {
				return nil, rerr
			}
			if reclaimed != nil {
				return reclaimed, nil
			}
			logger.Warn("short code collision, retrying", "attempt", attempt, "code_len", codeLen)
		} else {
			s.cacheDelete(ctx, logger, url.ShortCode)
			return url, nil
		}
	}
	return nil, domain.ErrURLShortenFailed
}

func (s *urlService) Redirect(ctx context.Context, code string) (string, error) {
	logger := ctxlog.GetLogger(ctx, slog.Default())

	longURL, err := s.cache.Get(ctx, code)

	if err == nil {
		if longURL == negativeCacheValue {
			return "", domain.ErrURLNotFound
		}
		s.incrementClicksAsync(logger, code)
		return longURL, nil
	}
	if !errors.Is(err, domain.ErrCacheMiss) {
		logger.Warn("cache get failed, falling back to db", "code", code, "error", err)
	}

	// Detach the shared work from this request's cancellation. singleflight hands the
	// leader's result to every follower, so binding the DB read to the leader's context
	// would let a single client disconnect fail every request coalesced behind it.
	sfCtx := context.WithoutCancel(ctx)

	val, err, _ := s.sf.Do(code, func() (any, error) {
		dbCtx, cancel := context.WithTimeout(sfCtx, dbReadTimeout)
		defer cancel()

		url, err := s.repo.GetByCode(dbCtx, code)

		if err != nil {
			if errors.Is(err, domain.ErrURLNotFound) {
				s.cacheSet(sfCtx, logger, code, negativeCacheValue, negativeCacheTTL)
			}
			return "", err
		}

		if url.ExpiresAt != nil && time.Now().After(*url.ExpiresAt) {
			return "", domain.ErrURLExpired
		}

		s.cacheSet(sfCtx, logger, code, url.LongURL, determineTTL(url.ExpiresAt))

		return url.LongURL, nil
	})
	if err != nil {
		return "", err
	}
	s.incrementClicksAsync(logger, code)
	return val.(string), nil
}

func (s *urlService) Delete(ctx context.Context, code string, userID int64) error {
	logger := ctxlog.GetLogger(ctx, slog.Default())

	err := s.repo.Deactivate(ctx, code, userID)

	if err != nil {
		return err
	}

	// Database-first invalidation: the row is already inactive, so evict synchronously
	// rather than racing a detached goroutine against the next redirect for this code.
	s.cacheDelete(ctx, logger, code)

	return nil
}

func (s *urlService) DeleteExpired(ctx context.Context, userID int64) (int64, error) {
	logger := ctxlog.GetLogger(ctx, slog.Default())

	codes, err := s.repo.DeactivateExpired(ctx, userID)
	if err != nil {
		return 0, err
	}

	for _, code := range codes {
		s.cacheDelete(ctx, logger, code)
	}

	return int64(len(codes)), nil
}

func (s *urlService) GetStats(ctx context.Context, code string, userID int64) (*domain.URL, error) {
	url, err := s.repo.GetStats(ctx, code)

	if err != nil {
		return nil, err
	}

	if url.UserID == nil || *url.UserID != userID {
		return nil, domain.ErrURLForbidden
	}

	return url, nil
}

func (s *urlService) GetUserURLs(ctx context.Context, userID int64) ([]*domain.URL, error) {
	return s.repo.GetUserURLs(ctx, userID)
}

func validateURL(longURL string) error {
	if longURL == "" {
		return domain.ErrURLInvalid
	}
	u, err := url.Parse(longURL)

	if err != nil || !(u.Scheme == "http" || u.Scheme == "https") || u.Host == "" {
		return domain.ErrURLInvalid
	}
	return nil
}

var reservedCodes = map[string]bool{
	"health":      true,
	"shorten":     true,
	"stats":       true,
	"auth":        true,
	"user":        true,
	"users":       true,
	"admin":       true,
	"api":         true,
	"dashboard":   true,
	"login":       true,
	"logout":      true,
	"register":    true,
	"static":      true,
	"assets":      true,
	"favicon.ico": true,
	"robots.txt":  true,
	"sitemap.xml": true,
	"index":       true,
	"home":        true,
	"404":         true,
	"410":         true,
}

// customCodeAlphabet is the character set a user-supplied alias may draw from: the
// same Base62 alphabet the generator uses, plus "-" and "_". Both additions are RFC
// 3986 unreserved characters, so an alias survives a round trip through a URL path
// without percent-encoding.
//
// Everything outside this set is rejected rather than escaped. An alias is echoed
// back as the path segment of the short URL and is matched by the GET /{code} route,
// so a "/" would produce a link the router can never resolve, and "?" or "#" would
// truncate it at the delimiter — dead links that permanently occupy an alias.
const customCodeAlphabet = shortcode.Alphabet + "-_"

func validateCustomCode(code string) error {
	if len(code) < 3 || len(code) > 30 {
		return domain.ErrCustomCodeInvalid
	}
	// Iterating bytes rather than runes is deliberate: every allowed character is
	// ASCII, so any byte of a multi-byte UTF-8 sequence falls outside the set and is
	// rejected. That also makes the byte-length bounds above exact — once a code
	// passes here, len(code) is its character count.
	for i := range len(code) {
		if strings.IndexByte(customCodeAlphabet, code[i]) < 0 {
			return domain.ErrCustomCodeInvalid
		}
	}
	if reservedCodes[strings.ToLower(code)] {
		return domain.ErrCustomCodeReserved
	}
	return nil
}

func determineTTL(expiresAt *time.Time) time.Duration {
	const defaultTTL = 1 * time.Hour
	if expiresAt == nil {
		return defaultTTL
	}
	ttl := time.Until(*expiresAt)

	if ttl <= 0 {
		return time.Second
	}
	if ttl > defaultTTL {
		return defaultTTL
	}
	return ttl
}
