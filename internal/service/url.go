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

type urlService struct {
	repo  domain.URLRepository
	cache domain.URLCache
	sf    singleflight.Group
}

func New(r domain.URLRepository, c domain.URLCache) domain.URLService {
	return &urlService{repo: r, cache: c}
}

func (s *urlService) Shorten(ctx context.Context, req domain.CreateURLRequest) (*domain.URL, error) {
	if err := validateURL(req.LongURL); err != nil {
		return nil, err
	}

	if req.CustomCode != "" {
		if err := validateCustomCode(req.CustomCode); err != nil {
			return nil, err
		}
		url, err := s.repo.Create(ctx, &req, req.CustomCode)
		if err != nil {
			return nil, err
		}
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
			ctxlog.GetLogger(ctx, slog.Default()).Warn("short code collision, retrying", "attempt", attempt, "code_len", codeLen)
		} else {
			return url, nil
		}
	}
	return nil, domain.ErrURLShortenFailed
}

func (s *urlService) Redirect(ctx context.Context, code string) (string, error) {

	longURL, err := s.cache.Get(ctx, code)

	if err == nil {
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			if err := s.repo.IncrementClicks(ctx, code); err != nil {
				ctxlog.GetLogger(ctx, slog.Default()).Error("async click increment failed", "code", code, "error", err)
			}
		}()
		return longURL, nil
	}
	if !errors.Is(err, domain.ErrCacheMiss) {
		ctxlog.GetLogger(ctx, slog.Default()).Warn("cache get failed, falling back to db", "code", code, "error", err)
	}

	val, err, _ := s.sf.Do(code, func() (any, error) {

		url, err := s.repo.GetByCode(ctx, code)

		if err != nil {
			return "", err
		}

		if url.ExpiresAt != nil && time.Now().After(*url.ExpiresAt) {
			return "", domain.ErrURLExpired
		}

		ttl := determineTTL(url.ExpiresAt)
		cacheCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		if err := s.cache.Set(cacheCtx, code, url.LongURL, ttl); err != nil {
			ctxlog.GetLogger(ctx, slog.Default()).Warn("failed to set cache", "code", url.ShortCode, "error", err)
		}

		return url.LongURL, nil
	})
	if err != nil {
		return "", err
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()

		if err := s.repo.IncrementClicks(ctx, code); err != nil {
			ctxlog.GetLogger(ctx, slog.Default()).Error("async click increment failed", "code", code, "error", err)
		}
	}()
	return val.(string), nil
}

func (s *urlService) Delete(ctx context.Context, code string, userID int64) error {
	err := s.repo.Deactivate(ctx, code, userID)

	if err != nil {
		return err
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		if err := s.cache.Delete(ctx, code); err != nil {
			ctxlog.GetLogger(ctx, slog.Default()).Warn("cache delete failed after deactivation", "code", code, "error", err)
		}
	}()

	return nil
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

func validateCustomCode(code string) error {
	if len(code) < 3 || len(code) > 30 {
		return domain.ErrCustomCodeInvalid
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
