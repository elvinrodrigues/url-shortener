package service

import (
	"context"
	"errors"
	"sort"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/elvinrodrigues/url-shortener/internal/domain"
)

// ---------------------------------------------------------------------------
// Fakes
//
// domain.URLRepository and domain.URLCache are declared in the domain package,
// so the service can be exercised against hand-written doubles with no mocking
// library. Every counter is atomic and every map access is mutex-guarded because
// the concurrency tests below run these fakes from hundreds of goroutines under
// -race.
// ---------------------------------------------------------------------------

type fakeRepo struct {
	mu     sync.Mutex
	rows   map[string]*domain.URL
	seen   []string
	nextID int64

	getByCodeCalls atomic.Int64
	createCalls    atomic.Int64
	incrCalls      atomic.Int64
	recycleCalls   atomic.Int64

	// lastRecycleCutoff records the quarantine boundary the service passed down,
	// so a test can assert the policy without reaching into the service package.
	lastRecycleCutoff time.Time

	// forceDuplicates rejects the first N Create calls with ErrURLDuplicate so the
	// collision-retry path can be driven deterministically instead of waiting for a
	// real 1-in-3.5-trillion collision.
	forceDuplicates int
	createErr       error

	getByCodeDelay time.Duration

	// getByCodeGate blocks GetByCode until closed; ctxErrAtRead records the context
	// error seen at the moment it unblocks, which is how the leader-cancellation
	// test proves the DB read is detached from the caller's context.
	getByCodeGate  chan struct{}
	getByCodeEnter chan struct{}
	ctxErrAtRead   error
	ctxErrRecorded bool
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{rows: make(map[string]*domain.URL)}
}

func (f *fakeRepo) put(u *domain.URL) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.rows[u.ShortCode] = u
}

func (f *fakeRepo) createdCodes() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.seen...)
}

func (f *fakeRepo) Create(ctx context.Context, req *domain.CreateURLRequest, shortCode string) (*domain.URL, error) {
	f.createCalls.Add(1)

	f.mu.Lock()
	defer f.mu.Unlock()

	f.seen = append(f.seen, shortCode)

	if f.createErr != nil {
		return nil, f.createErr
	}
	if f.forceDuplicates > 0 {
		f.forceDuplicates--
		return nil, domain.ErrURLDuplicate
	}
	if existing, exists := f.rows[shortCode]; exists && existing.IsActive {
		return nil, domain.ErrURLDuplicate
	}

	f.nextID++
	row := &domain.URL{
		ID:        f.nextID,
		ShortCode: shortCode,
		LongURL:   req.LongURL,
		CreatedAt: time.Now(),
		ExpiresAt: req.ExpiresAt,
		IsActive:  true,
		UserID:    req.UserID,
	}
	f.rows[shortCode] = row

	copied := *row
	return &copied, nil
}

func (f *fakeRepo) GetByCode(ctx context.Context, shortCode string) (*domain.URL, error) {
	f.getByCodeCalls.Add(1)

	if f.getByCodeEnter != nil {
		select {
		case f.getByCodeEnter <- struct{}{}:
		default:
		}
	}
	if f.getByCodeGate != nil {
		<-f.getByCodeGate
		f.mu.Lock()
		f.ctxErrAtRead = ctx.Err()
		f.ctxErrRecorded = true
		f.mu.Unlock()
	}
	if f.getByCodeDelay > 0 {
		time.Sleep(f.getByCodeDelay)
	}

	f.mu.Lock()
	defer f.mu.Unlock()

	row, ok := f.rows[shortCode]
	if !ok || !row.IsActive {
		return nil, domain.ErrURLNotFound
	}
	copied := *row
	return &copied, nil
}

func (f *fakeRepo) IncrementClicks(ctx context.Context, shortCode string) error {
	f.incrCalls.Add(1)
	return nil
}

func (f *fakeRepo) Deactivate(ctx context.Context, shortCode string, userID int64) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	row, ok := f.rows[shortCode]
	if !ok || !row.IsActive || row.UserID == nil || *row.UserID != userID {
		return domain.ErrURLNotFound
	}
	row.IsActive = false
	return nil
}

func (f *fakeRepo) GetStats(ctx context.Context, shortCode string) (*domain.URL, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	row, ok := f.rows[shortCode]
	if !ok {
		return nil, domain.ErrURLNotFound
	}
	copied := *row
	return &copied, nil
}

func (f *fakeRepo) GetUserURLs(ctx context.Context, userID int64) ([]*domain.URL, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	var out []*domain.URL
	for _, row := range f.rows {
		if row.IsActive && row.UserID != nil && *row.UserID == userID {
			copied := *row
			out = append(out, &copied)
		}
	}
	return out, nil
}

func (f *fakeRepo) RecycleExpiredGuestCode(ctx context.Context, shortCode string, expiredBefore time.Time) (bool, error) {
	f.recycleCalls.Add(1)

	f.mu.Lock()
	defer f.mu.Unlock()

	f.lastRecycleCutoff = expiredBefore

	row, ok := f.rows[shortCode]
	if !ok || !row.IsActive || row.UserID != nil || row.ExpiresAt == nil || !row.ExpiresAt.Before(expiredBefore) {
		return false, nil
	}
	row.IsActive = false
	return true, nil
}

func (f *fakeRepo) DeactivateExpired(ctx context.Context, userID int64) ([]string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	var deactivated []string
	now := time.Now()
	for _, row := range f.rows {
		if row.UserID != nil && *row.UserID == userID && row.IsActive && row.ExpiresAt != nil && row.ExpiresAt.Before(now) {
			row.IsActive = false
			deactivated = append(deactivated, row.ShortCode)
		}
	}
	return deactivated, nil
}

type fakeCache struct {
	mu          sync.Mutex
	data        map[string]string
	deletedKeys []string

	getCalls atomic.Int64
	setCalls atomic.Int64
	delCalls atomic.Int64

	getErr error // returned instead of a hit/miss, to simulate a transport failure
	setErr error
}

func newFakeCache() *fakeCache {
	return &fakeCache{data: make(map[string]string)}
}

func (f *fakeCache) Get(ctx context.Context, code string) (string, error) {
	f.getCalls.Add(1)

	if f.getErr != nil {
		return "", f.getErr
	}

	f.mu.Lock()
	defer f.mu.Unlock()

	val, ok := f.data[code]
	if !ok {
		return "", domain.ErrCacheMiss
	}
	return val, nil
}

func (f *fakeCache) Set(ctx context.Context, code, longURL string, ttl time.Duration) error {
	f.setCalls.Add(1)

	if f.setErr != nil {
		return f.setErr
	}

	f.mu.Lock()
	defer f.mu.Unlock()
	f.data[code] = longURL
	return nil
}

func (f *fakeCache) Delete(ctx context.Context, code string) error {
	f.delCalls.Add(1)

	f.mu.Lock()
	defer f.mu.Unlock()
	f.deletedKeys = append(f.deletedKeys, code)
	delete(f.data, code)
	return nil
}

func (f *fakeCache) getDeletedKeys() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.deletedKeys...)
}

func (f *fakeCache) peek(code string) (string, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	val, ok := f.data[code]
	return val, ok
}

func (f *fakeCache) seed(code, val string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.data[code] = val
}

// waitFor polls an atomic counter until it reaches want, so assertions about the
// detached click-increment goroutine don't depend on scheduler timing.
func waitFor(t *testing.T, want int64, counter *atomic.Int64) {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if counter.Load() == want {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("counter never reached %d (last value %d)", want, counter.Load())
}

func newTestService() (domain.URLService, *fakeRepo, *fakeCache) {
	repo := newFakeRepo()
	cache := newFakeCache()
	return New(repo, cache, ""), repo, cache
}

// ---------------------------------------------------------------------------
// Shorten
// ---------------------------------------------------------------------------

func TestShorten_RejectsInvalidURL(t *testing.T) {
	tests := []struct {
		name    string
		longURL string
	}{
		{"empty", ""},
		{"no scheme", "example.com/path"},
		{"unsupported scheme", "ftp://example.com"},
		{"javascript scheme", "javascript:alert(1)"},
		{"scheme without host", "http://"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			svc, repo, _ := newTestService()

			_, err := svc.Shorten(context.Background(), domain.CreateURLRequest{LongURL: tc.longURL})

			if !errors.Is(err, domain.ErrURLInvalid) {
				t.Fatalf("got %v, want ErrURLInvalid", err)
			}
			if got := repo.createCalls.Load(); got != 0 {
				t.Fatalf("repository was called %d times for an invalid URL", got)
			}
		})
	}
}

func TestShorten_ClampsGuestExpiryToOneMonth(t *testing.T) {
	userID := int64(42)
	farFuture := time.Now().AddDate(1, 0, 0)

	tests := []struct {
		name        string
		req         domain.CreateURLRequest
		wantClamped bool
	}{
		{
			name:        "guest with no expiry gets one",
			req:         domain.CreateURLRequest{LongURL: "https://example.com"},
			wantClamped: true,
		},
		{
			name:        "guest asking for a year is clamped",
			req:         domain.CreateURLRequest{LongURL: "https://example.com", ExpiresAt: &farFuture},
			wantClamped: true,
		},
		{
			name:        "authenticated user keeps a year",
			req:         domain.CreateURLRequest{LongURL: "https://example.com", ExpiresAt: &farFuture, UserID: &userID},
			wantClamped: false,
		},
		{
			name:        "authenticated user keeps no expiry",
			req:         domain.CreateURLRequest{LongURL: "https://example.com", UserID: &userID},
			wantClamped: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			svc, _, _ := newTestService()

			url, err := svc.Shorten(context.Background(), tc.req)
			if err != nil {
				t.Fatalf("Shorten: %v", err)
			}

			if !tc.wantClamped {
				if tc.req.ExpiresAt == nil {
					if url.ExpiresAt != nil {
						t.Fatalf("expiry %v was imposed on an authenticated user", url.ExpiresAt)
					}
					return
				}
				if url.ExpiresAt == nil || !url.ExpiresAt.Equal(farFuture) {
					t.Fatalf("got expiry %v, want the requested %v", url.ExpiresAt, farFuture)
				}
				return
			}

			if url.ExpiresAt == nil {
				t.Fatal("guest link was stored with no expiry")
			}
			wantMax := time.Now().AddDate(0, 1, 0)
			if diff := wantMax.Sub(*url.ExpiresAt); diff < -time.Minute || diff > time.Minute {
				t.Fatalf("got expiry %v, want ~%v (off by %v)", url.ExpiresAt, wantMax, diff)
			}
		})
	}
}

func TestShorten_RejectsBadCustomCodes(t *testing.T) {
	tests := []struct {
		name    string
		code    string
		wantErr error
	}{
		{"too short", "ab", domain.ErrCustomCodeInvalid},
		{"too long", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab", domain.ErrCustomCodeInvalid},
		{"reserved", "admin", domain.ErrCustomCodeReserved},
		{"reserved mixed case", "AdMiN", domain.ErrCustomCodeReserved},
		{"reserved route", "shorten", domain.ErrCustomCodeReserved},

		// Charset. A "/" escapes the single-segment GET /{code} route entirely; "?"
		// and "#" truncate the alias at the delimiter. Both yield a stored code that
		// can never be resolved while still consuming the alias.
		{"space", "has space", domain.ErrCustomCodeInvalid},
		{"slash", "slash/inject", domain.ErrCustomCodeInvalid},
		{"path traversal", "../../etc/passwd", domain.ErrCustomCodeInvalid},
		{"query delimiter", "question?mark", domain.ErrCustomCodeInvalid},
		{"fragment delimiter", "hash#frag", domain.ErrCustomCodeInvalid},
		{"percent encoding", "pct%20encoded", domain.ErrCustomCodeInvalid},
		{"html metacharacters", "<script>x</script>", domain.ErrCustomCodeInvalid},
		{"multi-byte utf-8", "héllo-ünicode", domain.ErrCustomCodeInvalid},
		{"leading whitespace", " abc", domain.ErrCustomCodeInvalid},
		{"null byte", "ab\x00c", domain.ErrCustomCodeInvalid},

		// A dotted reserved name fails the charset gate before the reserved gate, so
		// it reports Invalid rather than Reserved. Both refuse it; this pins which.
		{"dotted reserved name", "favicon.ico", domain.ErrCustomCodeInvalid},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			svc, repo, _ := newTestService()

			_, err := svc.Shorten(context.Background(), domain.CreateURLRequest{
				LongURL:    "https://example.com",
				CustomCode: tc.code,
			})

			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("got %v, want %v", err, tc.wantErr)
			}
			if got := repo.createCalls.Load(); got != 0 {
				t.Fatalf("repository was called %d times for a rejected custom code", got)
			}
		})
	}
}

// TestShorten_AcceptsValidCustomCodes is the counterweight to the rejection table:
// tightening the charset must not lock out the aliases people actually ask for.
func TestShorten_AcceptsValidCustomCodes(t *testing.T) {
	codes := []string{
		"abc",                            // the shortest permitted alias
		"MixedCase123",                   // full Base62
		"my-launch-page",                 // hyphens
		"under_score",                    // underscores
		"-leading-and-trailing-",         // separators at the edges are still URL-safe
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", // exactly 30, the column width
	}

	for _, code := range codes {
		t.Run(code, func(t *testing.T) {
			svc, _, _ := newTestService()

			url, err := svc.Shorten(context.Background(), domain.CreateURLRequest{
				LongURL:    "https://example.com",
				CustomCode: code,
			})
			if err != nil {
				t.Fatalf("valid alias %q was rejected: %v", code, err)
			}
			if url.ShortCode != code {
				t.Fatalf("got short code %q, want the requested %q", url.ShortCode, code)
			}
		})
	}
}

// TestShorten_RetriesCollisionsAndEscalatesLength pins the documented retry
// policy: five attempts, and the code widens from 7 to 8 characters once two
// attempts have collided.
func TestShorten_RetriesCollisionsAndEscalatesLength(t *testing.T) {
	svc, repo, _ := newTestService()
	repo.forceDuplicates = 2

	url, err := svc.Shorten(context.Background(), domain.CreateURLRequest{LongURL: "https://example.com"})
	if err != nil {
		t.Fatalf("Shorten should have survived 2 collisions: %v", err)
	}

	if got := repo.createCalls.Load(); got != 3 {
		t.Fatalf("got %d insert attempts, want 3", got)
	}

	wantLens := []int{7, 7, 8}
	codes := repo.createdCodes()
	if len(codes) != len(wantLens) {
		t.Fatalf("got %d attempted codes, want %d", len(codes), len(wantLens))
	}
	for i, wantLen := range wantLens {
		if len(codes[i]) != wantLen {
			t.Errorf("attempt %d used a %d-character code (%q), want %d", i+1, len(codes[i]), codes[i], wantLen)
		}
	}
	if url.ShortCode != codes[2] {
		t.Errorf("returned code %q, want the last attempted %q", url.ShortCode, codes[2])
	}
}

func TestShorten_ExhaustsRetryBudget(t *testing.T) {
	svc, repo, _ := newTestService()
	repo.forceDuplicates = 99

	_, err := svc.Shorten(context.Background(), domain.CreateURLRequest{LongURL: "https://example.com"})

	if !errors.Is(err, domain.ErrURLShortenFailed) {
		t.Fatalf("got %v, want ErrURLShortenFailed", err)
	}
	if got := repo.createCalls.Load(); got != 5 {
		t.Fatalf("got %d insert attempts, want the 5-attempt budget", got)
	}
}

func TestShorten_PropagatesUnexpectedRepositoryErrors(t *testing.T) {
	svc, repo, _ := newTestService()
	sentinel := errors.New("connection reset")
	repo.createErr = sentinel

	_, err := svc.Shorten(context.Background(), domain.CreateURLRequest{LongURL: "https://example.com"})

	if !errors.Is(err, sentinel) {
		t.Fatalf("got %v, want the underlying repository error", err)
	}
	if got := repo.createCalls.Load(); got != 1 {
		t.Fatalf("got %d insert attempts, want 1 (non-duplicate errors must not retry)", got)
	}
}

// TestShorten_EvictsNegativeCacheEntry guards the interaction between negative
// caching and creation: an alias probed before it existed must not stay 404 for
// the negative TTL once someone claims it.
func TestShorten_EvictsNegativeCacheEntry(t *testing.T) {
	svc, _, cache := newTestService()
	cache.seed("launch", negativeCacheValue)

	if _, err := svc.Shorten(context.Background(), domain.CreateURLRequest{
		LongURL:    "https://example.com",
		CustomCode: "launch",
	}); err != nil {
		t.Fatalf("Shorten: %v", err)
	}

	if val, ok := cache.peek("launch"); ok {
		t.Fatalf("negative cache entry survived creation as %q", val)
	}
}

// TestShorten_RecycleExpiredGuestCodes pins alias reclamation and, just as
// importantly, the two gates that keep it from becoming a link-hijacking vector:
// the claimant must be signed in, and the old link must have been expired for
// longer than guestAliasQuarantine.
func TestShorten_RecycleExpiredGuestCodes(t *testing.T) {
	claimant := int64(7)
	// longExpired is safely past the quarantine boundary; recentlyExpired is dead
	// but still inside it.
	longExpired := time.Now().Add(-guestAliasQuarantine - 24*time.Hour)
	recentlyExpired := time.Now().Add(-time.Hour)

	putGuestLink := func(repo *fakeRepo, code string, expiresAt time.Time) {
		repo.put(&domain.URL{
			ID:        1,
			ShortCode: code,
			LongURL:   "https://old.example.com",
			ExpiresAt: &expiresAt,
			IsActive:  true,
			UserID:    nil,
		})
	}

	t.Run("long-expired guest alias is reclaimed by a signed-in user", func(t *testing.T) {
		svc, repo, cache := newTestService()
		putGuestLink(repo, "recycleme", longExpired)
		cache.seed("recycleme", "https://old.example.com")

		newURL, err := svc.Shorten(context.Background(), domain.CreateURLRequest{
			LongURL:    "https://new.example.com",
			CustomCode: "recycleme",
			UserID:     &claimant,
		})
		if err != nil {
			t.Fatalf("expected successful shorten after recycling, got %v", err)
		}
		if newURL.LongURL != "https://new.example.com" {
			t.Fatalf("expected new URL to be https://new.example.com, got %s", newURL.LongURL)
		}
		if newURL.UserID == nil || *newURL.UserID != claimant {
			t.Fatalf("reclaimed link should belong to the claimant, got %v", newURL.UserID)
		}
		if _, ok := cache.peek("recycleme"); ok {
			t.Fatal("expected cache to be evicted for recycled short code")
		}
	})

	// The anonymous gate. Without it any passer-by could inherit the audience of a
	// guest link that was shared publicly before it lapsed.
	t.Run("a guest cannot reclaim, even past the quarantine", func(t *testing.T) {
		svc, repo, cache := newTestService()
		putGuestLink(repo, "recycleme", longExpired)
		cache.seed("recycleme", "https://old.example.com")

		_, err := svc.Shorten(context.Background(), domain.CreateURLRequest{
			LongURL:    "https://attacker.example.com",
			CustomCode: "recycleme",
		})
		if !errors.Is(err, domain.ErrURLDuplicate) {
			t.Fatalf("expected ErrURLDuplicate for an anonymous claimant, got %v", err)
		}
		if got := repo.recycleCalls.Load(); got != 0 {
			t.Fatalf("an anonymous request reached the repository %d times; it must be refused in the service", got)
		}
		if _, ok := cache.peek("recycleme"); !ok {
			t.Fatal("a refused reclaim evicted the cache entry anyway")
		}
	})

	// The quarantine gate. A link that lapsed an hour ago is still fresh in the
	// wild — bookmarks, QR codes, print — so its alias stays locked.
	t.Run("recently expired guest alias is still quarantined", func(t *testing.T) {
		svc, repo, _ := newTestService()
		putGuestLink(repo, "freshlydead", recentlyExpired)

		_, err := svc.Shorten(context.Background(), domain.CreateURLRequest{
			LongURL:    "https://new.example.com",
			CustomCode: "freshlydead",
			UserID:     &claimant,
		})
		if !errors.Is(err, domain.ErrURLDuplicate) {
			t.Fatalf("expected ErrURLDuplicate inside the quarantine window, got %v", err)
		}
	})

	// Pins the cutoff itself: the service must subtract the full quarantine, not
	// pass a bare time.Now() that would reclaim the instant a link lapses.
	t.Run("the cutoff handed to the repository is now minus the quarantine", func(t *testing.T) {
		svc, repo, _ := newTestService()
		putGuestLink(repo, "cutoffcheck", recentlyExpired)

		_, _ = svc.Shorten(context.Background(), domain.CreateURLRequest{
			LongURL:    "https://new.example.com",
			CustomCode: "cutoffcheck",
			UserID:     &claimant,
		})

		if got := repo.recycleCalls.Load(); got != 1 {
			t.Fatalf("expected exactly 1 recycle attempt, got %d", got)
		}

		repo.mu.Lock()
		cutoff := repo.lastRecycleCutoff
		repo.mu.Unlock()

		want := time.Now().Add(-guestAliasQuarantine)
		if diff := want.Sub(cutoff); diff < -time.Minute || diff > time.Minute {
			t.Fatalf("cutoff %v is not ~now-%v (off by %v)", cutoff, guestAliasQuarantine, diff)
		}
	})

	t.Run("unexpired guest alias is not recycled", func(t *testing.T) {
		svc, repo, _ := newTestService()
		putGuestLink(repo, "activeguest", time.Now().Add(2*time.Hour))

		_, err := svc.Shorten(context.Background(), domain.CreateURLRequest{
			LongURL:    "https://new.example.com",
			CustomCode: "activeguest",
			UserID:     &claimant,
		})
		if !errors.Is(err, domain.ErrURLDuplicate) {
			t.Fatalf("expected ErrURLDuplicate, got %v", err)
		}
	})

	t.Run("expired member alias is never recycled", func(t *testing.T) {
		svc, repo, _ := newTestService()
		owner := int64(42)
		repo.put(&domain.URL{
			ID:        1,
			ShortCode: "memberlink",
			LongURL:   "https://member.example.com",
			ExpiresAt: &longExpired,
			IsActive:  true,
			UserID:    &owner,
		})

		_, err := svc.Shorten(context.Background(), domain.CreateURLRequest{
			LongURL:    "https://new.example.com",
			CustomCode: "memberlink",
			UserID:     &claimant,
		})
		if !errors.Is(err, domain.ErrURLDuplicate) {
			t.Fatalf("expected ErrURLDuplicate for member link, got %v", err)
		}
	})
}

// TestShorten_ConcurrentInsertsProduceUniqueCodes runs the generator through the
// full service path from many goroutines at once. Uniqueness is enforced by the
// repository (mirroring the unique index in Postgres), so a duplicate would have
// to survive the retry loop to fail this test. Run under -race.
func TestShorten_ConcurrentInsertsProduceUniqueCodes(t *testing.T) {
	const goroutines = 200

	svc, repo, _ := newTestService()

	var (
		start sync.WaitGroup
		done  sync.WaitGroup
	)
	start.Add(1)
	done.Add(goroutines)

	codes := make([]string, goroutines)
	errs := make([]error, goroutines)

	for i := range goroutines {
		go func(i int) {
			defer done.Done()
			start.Wait()

			url, err := svc.Shorten(context.Background(), domain.CreateURLRequest{LongURL: "https://example.com"})
			if err != nil {
				errs[i] = err
				return
			}
			codes[i] = url.ShortCode
		}(i)
	}

	start.Done()
	done.Wait()

	seen := make(map[string]int, goroutines)
	for i, code := range codes {
		if errs[i] != nil {
			t.Fatalf("goroutine %d failed: %v", i, errs[i])
		}
		if prev, dup := seen[code]; dup {
			t.Fatalf("goroutines %d and %d both received code %q", prev, i, code)
		}
		seen[code] = i
	}

	if len(seen) != goroutines {
		t.Fatalf("got %d distinct codes, want %d", len(seen), goroutines)
	}
	if got := repo.createCalls.Load(); got < goroutines {
		t.Fatalf("got %d insert attempts for %d links", got, goroutines)
	}
}

// ---------------------------------------------------------------------------
// Redirect
// ---------------------------------------------------------------------------

func TestRedirect_CacheHitSkipsRepository(t *testing.T) {
	svc, repo, cache := newTestService()
	cache.seed("abc1234", "https://example.com/deep")

	got, err := svc.Redirect(context.Background(), "abc1234")
	if err != nil {
		t.Fatalf("Redirect: %v", err)
	}
	if got != "https://example.com/deep" {
		t.Fatalf("got %q, want the cached destination", got)
	}
	if calls := repo.getByCodeCalls.Load(); calls != 0 {
		t.Fatalf("cache hit still issued %d database reads", calls)
	}

	waitFor(t, 1, &repo.incrCalls)
}

// TestRedirect_SingleflightCoalescesConcurrentMisses is the assertion behind the
// stampede-prevention claim: with a cold cache and a slow database, N concurrent
// redirects for the same code must collapse into exactly one query.
func TestRedirect_SingleflightCoalescesConcurrentMisses(t *testing.T) {
	const goroutines = 100

	svc, repo, cache := newTestService()
	repo.getByCodeDelay = 100 * time.Millisecond
	repo.put(&domain.URL{ShortCode: "hotkey", LongURL: "https://example.com/hot", IsActive: true})

	var (
		start sync.WaitGroup
		done  sync.WaitGroup
	)
	start.Add(1)
	done.Add(goroutines)

	results := make([]string, goroutines)
	errs := make([]error, goroutines)

	for i := range goroutines {
		go func(i int) {
			defer done.Done()
			start.Wait()
			results[i], errs[i] = svc.Redirect(context.Background(), "hotkey")
		}(i)
	}

	start.Done()
	done.Wait()

	for i := range goroutines {
		if errs[i] != nil {
			t.Fatalf("goroutine %d failed: %v", i, errs[i])
		}
		if results[i] != "https://example.com/hot" {
			t.Fatalf("goroutine %d got %q, want the shared destination", i, results[i])
		}
	}

	if calls := repo.getByCodeCalls.Load(); calls != 1 {
		t.Fatalf("got %d database reads for %d concurrent cache misses, want exactly 1", calls, goroutines)
	}
	if val, ok := cache.peek("hotkey"); !ok || val != "https://example.com/hot" {
		t.Fatalf("cache was not populated by the coalesced read (got %q, present=%v)", val, ok)
	}
}

// TestRedirect_LeaderCancellationDoesNotAbortSharedRead covers the singleflight
// footgun: followers receive the leader's result, so binding the shared database
// read to the leader's request context would let one disconnecting client fail
// every request coalesced behind it.
func TestRedirect_LeaderCancellationDoesNotAbortSharedRead(t *testing.T) {
	svc, repo, _ := newTestService()
	repo.getByCodeGate = make(chan struct{})
	repo.getByCodeEnter = make(chan struct{}, 1)
	repo.put(&domain.URL{ShortCode: "shared", LongURL: "https://example.com/shared", IsActive: true})

	ctx, cancel := context.WithCancel(context.Background())

	type result struct {
		url string
		err error
	}
	resultCh := make(chan result, 1)

	go func() {
		url, err := svc.Redirect(ctx, "shared")
		resultCh <- result{url, err}
	}()

	// Wait until the shared read is in flight, then cancel the request that started it.
	select {
	case <-repo.getByCodeEnter:
	case <-time.After(2 * time.Second):
		t.Fatal("database read never started")
	}
	cancel()
	close(repo.getByCodeGate)

	select {
	case got := <-resultCh:
		if got.err != nil {
			t.Fatalf("shared read failed after the leader cancelled: %v", got.err)
		}
		if got.url != "https://example.com/shared" {
			t.Fatalf("got %q, want the destination", got.url)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Redirect never returned")
	}

	repo.mu.Lock()
	recorded, ctxErr := repo.ctxErrRecorded, repo.ctxErrAtRead
	repo.mu.Unlock()

	if !recorded {
		t.Fatal("the gated read never recorded a context error")
	}
	if ctxErr != nil {
		t.Fatalf("the shared database read observed %v; it must be detached from the caller's cancellation", ctxErr)
	}
}

func TestRedirect_ExpiredLinkIsGone(t *testing.T) {
	svc, _, cache := newTestService()
	repoExpiry := time.Now().Add(-time.Hour)

	repo := newFakeRepo()
	repo.put(&domain.URL{ShortCode: "stale", LongURL: "https://example.com", ExpiresAt: &repoExpiry, IsActive: true})
	svc = New(repo, cache, "")

	_, err := svc.Redirect(context.Background(), "stale")

	if !errors.Is(err, domain.ErrURLExpired) {
		t.Fatalf("got %v, want ErrURLExpired", err)
	}
	if _, ok := cache.peek("stale"); ok {
		t.Fatal("an expired destination was written to the cache")
	}
}

func TestRedirect_UnknownCodeIsNotFound(t *testing.T) {
	svc, repo, _ := newTestService()

	_, err := svc.Redirect(context.Background(), "missing")

	if !errors.Is(err, domain.ErrURLNotFound) {
		t.Fatalf("got %v, want ErrURLNotFound", err)
	}
	if got := repo.incrCalls.Load(); got != 0 {
		t.Fatalf("a missing code incremented the click counter %d times", got)
	}
}

// TestRedirect_NegativeCachingShieldsRepository covers the amplification path:
// repeated probes for a code that does not exist must not each cost a query.
func TestRedirect_NegativeCachingShieldsRepository(t *testing.T) {
	svc, repo, cache := newTestService()

	for i := range 5 {
		_, err := svc.Redirect(context.Background(), "nope")
		if !errors.Is(err, domain.ErrURLNotFound) {
			t.Fatalf("probe %d got %v, want ErrURLNotFound", i, err)
		}
	}

	if calls := repo.getByCodeCalls.Load(); calls != 1 {
		t.Fatalf("got %d database reads for 5 probes of a missing code, want 1", calls)
	}
	if val, ok := cache.peek("nope"); !ok || val != negativeCacheValue {
		t.Fatalf("missing code was not negatively cached (got %q, present=%v)", val, ok)
	}
}

func TestRedirect_NegativeCacheHitIsNotServedAsDestination(t *testing.T) {
	svc, repo, cache := newTestService()
	cache.seed("nope", negativeCacheValue)

	got, err := svc.Redirect(context.Background(), "nope")

	if !errors.Is(err, domain.ErrURLNotFound) {
		t.Fatalf("got (%q, %v), want ErrURLNotFound", got, err)
	}
	if got != "" {
		t.Fatalf("the sentinel leaked to the caller as %q", got)
	}
	if calls := repo.getByCodeCalls.Load(); calls != 0 {
		t.Fatalf("negative cache hit still issued %d database reads", calls)
	}
	if calls := repo.incrCalls.Load(); calls != 0 {
		t.Fatalf("negative cache hit incremented clicks %d times", calls)
	}
}

// TestRedirect_FallsBackToDatabaseOnCacheOutage is the unit-level counterpart to
// the Redis-outage load test: a transport failure from the cache must degrade to
// Postgres rather than fail the request.
func TestRedirect_FallsBackToDatabaseOnCacheOutage(t *testing.T) {
	repo := newFakeRepo()
	repo.put(&domain.URL{ShortCode: "abc1234", LongURL: "https://example.com/live", IsActive: true})

	cache := newFakeCache()
	cache.getErr = errors.New("dial tcp: connection refused")
	cache.setErr = errors.New("dial tcp: connection refused")

	svc := New(repo, cache, "")

	got, err := svc.Redirect(context.Background(), "abc1234")
	if err != nil {
		t.Fatalf("Redirect should have degraded to the database: %v", err)
	}
	if got != "https://example.com/live" {
		t.Fatalf("got %q, want the database destination", got)
	}
	if calls := repo.getByCodeCalls.Load(); calls != 1 {
		t.Fatalf("got %d database reads, want 1", calls)
	}
}

// ---------------------------------------------------------------------------
// Delete / GetStats
// ---------------------------------------------------------------------------

func TestDelete_EvictsCacheSynchronously(t *testing.T) {
	owner := int64(7)

	repo := newFakeRepo()
	repo.put(&domain.URL{ShortCode: "mine", LongURL: "https://example.com", IsActive: true, UserID: &owner})

	cache := newFakeCache()
	cache.seed("mine", "https://example.com")

	svc := New(repo, cache, "")

	if err := svc.Delete(context.Background(), "mine", owner); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	// Synchronous eviction: no polling, the entry must already be gone on return.
	if _, ok := cache.peek("mine"); ok {
		t.Fatal("cache entry survived deletion")
	}
}

func TestDelete_ScopesToOwner(t *testing.T) {
	owner := int64(7)
	attacker := int64(8)

	repo := newFakeRepo()
	repo.put(&domain.URL{ShortCode: "mine", LongURL: "https://example.com", IsActive: true, UserID: &owner})

	cache := newFakeCache()
	cache.seed("mine", "https://example.com")

	svc := New(repo, cache, "")

	err := svc.Delete(context.Background(), "mine", attacker)

	// Not-found rather than forbidden: a distinct 403 would confirm the code exists.
	if !errors.Is(err, domain.ErrURLNotFound) {
		t.Fatalf("got %v, want ErrURLNotFound for a non-owner", err)
	}
	if _, ok := cache.peek("mine"); !ok {
		t.Fatal("a failed delete evicted the cache entry anyway")
	}
	if got := cache.delCalls.Load(); got != 0 {
		t.Fatalf("a failed delete issued %d cache deletions", got)
	}
}

func TestGetStats_EnforcesOwnership(t *testing.T) {
	owner := int64(7)

	repo := newFakeRepo()
	repo.put(&domain.URL{ShortCode: "mine", LongURL: "https://example.com", IsActive: true, UserID: &owner})
	repo.put(&domain.URL{ShortCode: "guest", LongURL: "https://example.com", IsActive: true})

	svc := New(repo, newFakeCache(), "")

	t.Run("owner", func(t *testing.T) {
		url, err := svc.GetStats(context.Background(), "mine", owner)
		if err != nil {
			t.Fatalf("GetStats: %v", err)
		}
		if url.ShortCode != "mine" {
			t.Fatalf("got %q, want %q", url.ShortCode, "mine")
		}
	})

	t.Run("non-owner", func(t *testing.T) {
		if _, err := svc.GetStats(context.Background(), "mine", 8); !errors.Is(err, domain.ErrURLForbidden) {
			t.Fatalf("got %v, want ErrURLForbidden", err)
		}
	})

	t.Run("guest-owned link has no viewer", func(t *testing.T) {
		if _, err := svc.GetStats(context.Background(), "guest", owner); !errors.Is(err, domain.ErrURLForbidden) {
			t.Fatalf("got %v, want ErrURLForbidden", err)
		}
	})

	t.Run("missing", func(t *testing.T) {
		if _, err := svc.GetStats(context.Background(), "absent", owner); !errors.Is(err, domain.ErrURLNotFound) {
			t.Fatalf("got %v, want ErrURLNotFound", err)
		}
	})
}

// ---------------------------------------------------------------------------
// TTL policy
// ---------------------------------------------------------------------------

func TestDetermineTTL(t *testing.T) {
	tests := []struct {
		name      string
		expiresAt *time.Time
		want      time.Duration
		tolerance time.Duration
	}{
		{name: "no expiry uses the default", expiresAt: nil, want: time.Hour},
		{name: "distant expiry is capped at the default", expiresAt: ptrTime(time.Now().Add(72 * time.Hour)), want: time.Hour},
		{name: "near expiry shortens the ttl", expiresAt: ptrTime(time.Now().Add(90 * time.Second)), want: 90 * time.Second, tolerance: 2 * time.Second},
		{name: "already expired gets the eviction floor", expiresAt: ptrTime(time.Now().Add(-time.Hour)), want: time.Second},
		{name: "exactly now gets the eviction floor", expiresAt: ptrTime(time.Now()), want: time.Second},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := determineTTL(tc.expiresAt)

			if diff := tc.want - got; diff < -tc.tolerance || diff > tc.tolerance {
				t.Fatalf("got %v, want %v (tolerance %v)", got, tc.want, tc.tolerance)
			}
		})
	}
}

func ptrTime(t time.Time) *time.Time { return &t }

func TestURLService_DeleteExpired(t *testing.T) {
	repo := newFakeRepo()
	cache := newFakeCache()
	svc := New(repo, cache, "")
	ctx := context.Background()

	user1 := int64(1)
	user2 := int64(2)
	past := time.Now().Add(-time.Hour)
	future := time.Now().Add(time.Hour)

	// User 1: 2 expired active links, 1 live active link, 1 already inactive expired link
	repo.put(&domain.URL{ShortCode: "u1-exp1", UserID: &user1, IsActive: true, ExpiresAt: &past})
	repo.put(&domain.URL{ShortCode: "u1-exp2", UserID: &user1, IsActive: true, ExpiresAt: &past})
	repo.put(&domain.URL{ShortCode: "u1-live", UserID: &user1, IsActive: true, ExpiresAt: &future})
	repo.put(&domain.URL{ShortCode: "u1-inact", UserID: &user1, IsActive: false, ExpiresAt: &past})

	// User 2: 1 expired active link
	repo.put(&domain.URL{ShortCode: "u2-exp", UserID: &user2, IsActive: true, ExpiresAt: &past})

	// Guest: 1 expired active link
	repo.put(&domain.URL{ShortCode: "guest-exp", UserID: nil, IsActive: true, ExpiresAt: &past})

	// Prime cache for all codes
	cache.Set(ctx, "u1-exp1", "https://example.com/1", time.Hour)
	cache.Set(ctx, "u1-exp2", "https://example.com/2", time.Hour)
	cache.Set(ctx, "u1-live", "https://example.com/live", time.Hour)
	cache.Set(ctx, "u2-exp", "https://example.com/u2", time.Hour)

	count, err := svc.DeleteExpired(ctx, user1)
	if err != nil {
		t.Fatalf("DeleteExpired failed: %v", err)
	}
	if count != 2 {
		t.Fatalf("expected count 2, got %d", count)
	}

	deleted := cache.getDeletedKeys()
	sort.Strings(deleted)
	expectedDeleted := []string{"u1-exp1", "u1-exp2"}
	if len(deleted) != len(expectedDeleted) {
		t.Fatalf("expected %d cache evictions, got %d (%v)", len(expectedDeleted), len(deleted), deleted)
	}
	for i := range deleted {
		if deleted[i] != expectedDeleted[i] {
			t.Fatalf("expected cache eviction %q at index %d, got %q", expectedDeleted[i], i, deleted[i])
		}
	}
}

// TestShorten_RejectsSelfReferentialURLs pins the loop guard. A destination on
// this deployment's own host redirects back into the service: every hop costs a
// cache lookup, a database read and a detached click increment.
func TestShorten_RejectsSelfReferentialURLs(t *testing.T) {
	const base = "https://trimto.me"

	rejected := []struct {
		name string
		url  string
	}{
		{"bare host", "https://trimto.me"},
		{"short link on our host", "https://trimto.me/abc1234"},
		{"http instead of https", "http://trimto.me/abc1234"},
		{"case-insensitive host", "https://TrimTo.ME/abc1234"},
		{"different port, same host", "https://trimto.me:8443/abc1234"},
		{"with query and fragment", "https://trimto.me/abc?x=1#y"},
	}

	for _, tc := range rejected {
		t.Run(tc.name, func(t *testing.T) {
			svc, repo, _ := newTestServiceWithBase(base)

			_, err := svc.Shorten(context.Background(), domain.CreateURLRequest{LongURL: tc.url})

			if !errors.Is(err, domain.ErrURLSelfReferential) {
				t.Fatalf("got %v, want ErrURLSelfReferential", err)
			}
			if got := repo.createCalls.Load(); got != 0 {
				t.Fatalf("a self-referential URL reached the repository %d times", got)
			}
		})
	}

	// Hosts that merely resemble ours must still be shortenable — the check is a
	// host comparison, not a substring match.
	accepted := []string{
		"https://example.com/trimto.me",
		"https://nottrimto.me/x",
		"https://trimto.me.evil.com/x",
		"https://sub.trimto.me/x",
	}

	for _, u := range accepted {
		t.Run("accepts "+u, func(t *testing.T) {
			svc, _, _ := newTestServiceWithBase(base)

			if _, err := svc.Shorten(context.Background(), domain.CreateURLRequest{LongURL: u}); err != nil {
				t.Fatalf("legitimate destination %q was rejected: %v", u, err)
			}
		})
	}
}

// TestShorten_SelfCheckDisabledWithoutBaseURL documents the escape hatch: an
// unset BASE_URL disables the comparison rather than rejecting everything.
func TestShorten_SelfCheckDisabledWithoutBaseURL(t *testing.T) {
	svc, _, _ := newTestService()

	if _, err := svc.Shorten(context.Background(), domain.CreateURLRequest{LongURL: "https://trimto.me/abc"}); err != nil {
		t.Fatalf("with no BASE_URL configured nothing is self-referential, got %v", err)
	}
}

func newTestServiceWithBase(baseURL string) (domain.URLService, *fakeRepo, *fakeCache) {
	repo := newFakeRepo()
	cache := newFakeCache()
	return New(repo, cache, baseURL), repo, cache
}
