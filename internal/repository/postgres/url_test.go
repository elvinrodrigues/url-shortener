package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/elvinrodrigues/url-shortener/internal/domain"
	"github.com/elvinrodrigues/url-shortener/internal/service"
	"github.com/lib/pq"
)

func findMigrationsDir() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		candidate := filepath.Join(dir, "migrations")
		if info, err := os.Stat(candidate); err == nil && info.IsDir() {
			return candidate, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "", errors.New("migrations directory not found")
}

func applyMigrations(db *sql.DB) error {
	migDir, err := findMigrationsDir()
	if err != nil {
		return fmt.Errorf("finding migrations: %w", err)
	}

	entries, err := os.ReadDir(migDir)
	if err != nil {
		return fmt.Errorf("reading migrations dir: %w", err)
	}

	var sqlFiles []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			sqlFiles = append(sqlFiles, e.Name())
		}
	}
	sort.Strings(sqlFiles)

	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
		filename VARCHAR(255) PRIMARY KEY,
		applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);`); err != nil {
		return fmt.Errorf("creating schema_migrations: %w", err)
	}

	for _, name := range sqlFiles {
		var exists bool
		err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE filename = $1)", name).Scan(&exists)
		if err != nil {
			return fmt.Errorf("checking migration %s: %w", name, err)
		}
		if exists {
			continue
		}

		content, err := os.ReadFile(filepath.Join(migDir, name))
		if err != nil {
			return fmt.Errorf("reading migration %s: %w", name, err)
		}

		if _, err := db.Exec(string(content)); err != nil {
			var pqErr *pq.Error
			if errors.As(err, &pqErr) && (pqErr.Code == "42P07" || pqErr.Code == "42710") {
				// Object or relation already exists
			} else {
				return fmt.Errorf("executing migration %s: %w", name, err)
			}
		}

		if _, err := db.Exec("INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING", name); err != nil {
			return fmt.Errorf("recording migration %s: %w", name, err)
		}
	}
	return nil
}

func assertTestDatabase(dbURL string) error {
	u, err := url.Parse(dbURL)
	if err != nil {
		return fmt.Errorf("TEST_DATABASE_URL is not a valid URL: %w", err)
	}
	name := strings.TrimPrefix(u.Path, "/")
	if !strings.HasSuffix(name, "_test") {
		return fmt.Errorf("refusing to run: TEST_DATABASE_URL points at %q; "+
			"these tests TRUNCATE urls and users, so the name must end in _test", name)
	}
	return nil
}

func TestMain(m *testing.M) {
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL != "" {
		if err := assertTestDatabase(dbURL); err != nil {
			fmt.Fprintf(os.Stderr, "%v\n", err)
			os.Exit(1)
		}
		db, err := sql.Open("postgres", dbURL)
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to open test database: %v\n", err)
			os.Exit(1)
		}
		if err := applyMigrations(db); err != nil {
			db.Close()
			fmt.Fprintf(os.Stderr, "failed to apply migrations: %v\n", err)
			os.Exit(1)
		}
		db.Close()
	}
	os.Exit(m.Run())
}

func setupTestDB(t *testing.T) (*URLPostgres, *sql.DB) {
	t.Helper()

	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		t.Skip("skipping postgres integration test: TEST_DATABASE_URL not set")
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		t.Fatalf("opening test db: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		db.Close()
		t.Fatalf("pinging test db: %v", err)
	}

	// Clean tables before each test
	if _, err := db.ExecContext(ctx, "TRUNCATE TABLE urls, users RESTART IDENTITY CASCADE;"); err != nil {
		db.Close()
		t.Fatalf("truncating tables: %v", err)
	}

	t.Cleanup(func() {
		db.Close()
	})

	return New(db), db
}

// 1. Three rows sharing one short_code (2 inactive + 1 active) — GetStats
// returns the ACTIVE row, deterministically, across repeated runs.
func TestGetStats_PrefersActiveRowDeterministically(t *testing.T) {
	repo, db := setupTestDB(t)
	ctx := context.Background()

	const shortCode = "shared-alias"

	// Insert 2 inactive rows (one older, one newer) and 1 active row.
	var inactive1ID, inactive2ID, activeID int64
	err := db.QueryRowContext(ctx, `
		INSERT INTO urls (short_code, long_url, is_active, created_at)
		VALUES ($1, 'https://example.com/inactive1', false, NOW() - INTERVAL '2 hour')
		RETURNING id
	`, shortCode).Scan(&inactive1ID)
	if err != nil {
		t.Fatalf("inserting inactive row 1: %v", err)
	}

	err = db.QueryRowContext(ctx, `
		INSERT INTO urls (short_code, long_url, is_active, created_at)
		VALUES ($1, 'https://example.com/inactive2', false, NOW() - INTERVAL '1 hour')
		RETURNING id
	`, shortCode).Scan(&inactive2ID)
	if err != nil {
		t.Fatalf("inserting inactive row 2: %v", err)
	}

	err = db.QueryRowContext(ctx, `
		INSERT INTO urls (short_code, long_url, is_active, created_at)
		VALUES ($1, 'https://example.com/active', true, NOW())
		RETURNING id
	`, shortCode).Scan(&activeID)
	if err != nil {
		t.Fatalf("inserting active row: %v", err)
	}

	// Run GetStats repeatedly to prove determinism.
	for i := 0; i < 20; i++ {
		url, err := repo.GetStats(ctx, shortCode)
		if err != nil {
			t.Fatalf("iteration %d: GetStats failed: %v", i, err)
		}
		if url.ID != activeID {
			t.Fatalf("iteration %d: expected active row ID %d, got %d", i, activeID, url.ID)
		}
		if !url.IsActive {
			t.Fatalf("iteration %d: expected url.IsActive == true", i)
		}
		if url.LongURL != "https://example.com/active" {
			t.Fatalf("iteration %d: expected long_url https://example.com/active, got %s", i, url.LongURL)
		}
	}

	// When all rows are inactive, it falls back to the most recent inactive row.
	if _, err := db.ExecContext(ctx, "UPDATE urls SET is_active = false WHERE id = $1", activeID); err != nil {
		t.Fatalf("deactivating active row: %v", err)
	}

	url, err := repo.GetStats(ctx, shortCode)
	if err != nil {
		t.Fatalf("GetStats on inactive link failed: %v", err)
	}
	if url.ID != activeID {
		t.Fatalf("expected most recent inactive row ID %d, got %d", activeID, url.ID)
	}
	if url.IsActive {
		t.Fatalf("expected url.IsActive == false")
	}
}

// 2. IncrementClicks with duplicates present increments ONLY the active row.
func TestIncrementClicks_IncrementsOnlyActiveRow(t *testing.T) {
	repo, db := setupTestDB(t)
	ctx := context.Background()

	const shortCode = "click-alias"

	var inactive1ID, inactive2ID, activeID int64
	err := db.QueryRowContext(ctx, `
		INSERT INTO urls (short_code, long_url, is_active, click_count, created_at)
		VALUES ($1, 'https://example.com/inactive1', false, 0, NOW() - INTERVAL '2 hour')
		RETURNING id
	`, shortCode).Scan(&inactive1ID)
	if err != nil {
		t.Fatalf("inserting inactive 1: %v", err)
	}

	err = db.QueryRowContext(ctx, `
		INSERT INTO urls (short_code, long_url, is_active, click_count, created_at)
		VALUES ($1, 'https://example.com/inactive2', false, 0, NOW() - INTERVAL '1 hour')
		RETURNING id
	`, shortCode).Scan(&inactive2ID)
	if err != nil {
		t.Fatalf("inserting inactive 2: %v", err)
	}

	err = db.QueryRowContext(ctx, `
		INSERT INTO urls (short_code, long_url, is_active, click_count, created_at)
		VALUES ($1, 'https://example.com/active', true, 0, NOW())
		RETURNING id
	`, shortCode).Scan(&activeID)
	if err != nil {
		t.Fatalf("inserting active: %v", err)
	}

	// Increment clicks
	if err := repo.IncrementClicks(ctx, shortCode); err != nil {
		t.Fatalf("IncrementClicks failed: %v", err)
	}

	// Check counts for all 3 rows
	var activeClicks, inactive1Clicks, inactive2Clicks int64
	if err := db.QueryRowContext(ctx, "SELECT click_count FROM urls WHERE id = $1", activeID).Scan(&activeClicks); err != nil {
		t.Fatalf("querying active clicks: %v", err)
	}
	if err := db.QueryRowContext(ctx, "SELECT click_count FROM urls WHERE id = $1", inactive1ID).Scan(&inactive1Clicks); err != nil {
		t.Fatalf("querying inactive 1 clicks: %v", err)
	}
	if err := db.QueryRowContext(ctx, "SELECT click_count FROM urls WHERE id = $1", inactive2ID).Scan(&inactive2Clicks); err != nil {
		t.Fatalf("querying inactive 2 clicks: %v", err)
	}

	if activeClicks != 1 {
		t.Fatalf("expected active row click_count == 1, got %d", activeClicks)
	}
	if inactive1Clicks != 0 {
		t.Fatalf("expected inactive 1 click_count == 0, got %d", inactive1Clicks)
	}
	if inactive2Clicks != 0 {
		t.Fatalf("expected inactive 2 click_count == 0, got %d", inactive2Clicks)
	}

	// Deactivate active row; IncrementClicks must now return ErrURLNotFound.
	if _, err := db.ExecContext(ctx, "UPDATE urls SET is_active = false WHERE id = $1", activeID); err != nil {
		t.Fatalf("deactivating active row: %v", err)
	}

	if err := repo.IncrementClicks(ctx, shortCode); !errors.Is(err, domain.ErrURLNotFound) {
		t.Fatalf("expected ErrURLNotFound when only inactive rows exist, got: %v", err)
	}
}

// 3. The Alice/Bob scenario end to end: Alice creates and deletes "launch",
// Bob claims it, Bob's GetStats succeeds and returns HIS row.
type noopCache struct{}

func (noopCache) Get(_ context.Context, _ string) (string, error)                  { return "", domain.ErrCacheMiss }
func (noopCache) Set(_ context.Context, _ string, _ string, _ time.Duration) error { return nil }
func (noopCache) Delete(_ context.Context, _ string) error                         { return nil }

func TestAliceBob_OwnershipInversionResolved(t *testing.T) {
	repo, _ := setupTestDB(t)
	ctx := context.Background()

	// Alice and Bob exist
	alice, err := repo.UpsertGoogleUser(ctx, "alice-google-id", "alice@example.com", "Alice", "")
	if err != nil {
		t.Fatalf("creating alice: %v", err)
	}
	bob, err := repo.UpsertGoogleUser(ctx, "bob-google-id", "bob@example.com", "Bob", "")
	if err != nil {
		t.Fatalf("creating bob: %v", err)
	}

	svc := service.New(repo, noopCache{})
	const code = "launch"

	// 1. Alice creates "launch"
	aliceURL, err := repo.Create(ctx, &domain.CreateURLRequest{
		LongURL: "https://alice.example.com",
		UserID:  &alice.ID,
	}, code)
	if err != nil {
		t.Fatalf("alice creating link: %v", err)
	}
	if aliceURL.ShortCode != code {
		t.Fatalf("expected short_code %s, got %s", code, aliceURL.ShortCode)
	}

	// 2. Alice deletes "launch"
	if err := svc.Delete(ctx, code, alice.ID); err != nil {
		t.Fatalf("alice deleting link: %v", err)
	}

	// 3. Bob claims "launch"
	bobURL, err := repo.Create(ctx, &domain.CreateURLRequest{
		LongURL: "https://bob.example.com",
		UserID:  &bob.ID,
	}, code)
	if err != nil {
		t.Fatalf("bob claiming link: %v", err)
	}
	if bobURL.ShortCode != code {
		t.Fatalf("expected short_code %s, got %s", code, bobURL.ShortCode)
	}

	// 4. Bob's GetStats succeeds and returns HIS row
	stats, err := svc.GetStats(ctx, code, bob.ID)
	if err != nil {
		t.Fatalf("bob GetStats failed: %v", err)
	}
	if stats.ID != bobURL.ID {
		t.Fatalf("expected Bob's URL ID %d, got %d", bobURL.ID, stats.ID)
	}
	if stats.UserID == nil || *stats.UserID != bob.ID {
		t.Fatalf("expected stats to belong to Bob (%d), got %v", bob.ID, stats.UserID)
	}
	if stats.LongURL != "https://bob.example.com" {
		t.Fatalf("expected Bob's long_url, got %s", stats.LongURL)
	}

	// 5. Alice's GetStats fails with ErrURLForbidden (she does not own the live link)
	_, err = svc.GetStats(ctx, code, alice.ID)
	if !errors.Is(err, domain.ErrURLForbidden) {
		t.Fatalf("expected ErrURLForbidden for Alice, got %v", err)
	}
}

// 4. EXPLAIN confirms an Index Scan (and not Seq Scan) is used by the GetStats query.
func TestExplain_GetStatsUsesIndexScan(t *testing.T) {
	_, db := setupTestDB(t)
	ctx := context.Background()

	// Populate enough rows that the planner prefers an index scan.
	_, err := db.ExecContext(ctx, `
		INSERT INTO urls (short_code, long_url, is_active, created_at)
		SELECT 'code_' || i, 'https://example.com/' || i, true, NOW()
		FROM generate_series(1, 2000) AS i;
	`)
	if err != nil {
		t.Fatalf("populating rows for explain test: %v", err)
	}

	// Analyze table so optimizer statistics are updated.
	if _, err := db.ExecContext(ctx, "ANALYZE urls;"); err != nil {
		t.Fatalf("running ANALYZE: %v", err)
	}

	query := `EXPLAIN SELECT id,short_code,long_url,created_at,expires_at,click_count,is_active,user_id FROM urls WHERE short_code = $1 ORDER BY is_active DESC, created_at DESC LIMIT 1;`
	rows, err := db.QueryContext(ctx, query, "code_500")
	if err != nil {
		t.Fatalf("running EXPLAIN: %v", err)
	}
	defer rows.Close()

	var planBuilder strings.Builder
	for rows.Next() {
		var line string
		if err := rows.Scan(&line); err != nil {
			t.Fatalf("scanning explain line: %v", err)
		}
		planBuilder.WriteString(line)
		planBuilder.WriteString("\n")
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("reading explain rows: %v", err)
	}

	plan := planBuilder.String()
	t.Logf("Query Plan:\n%s", plan)

	if !strings.Contains(plan, "Index Scan") && !strings.Contains(plan, "Index Only Scan") {
		t.Fatalf("expected query plan to use an Index Scan, got:\n%s", plan)
	}
	if strings.Contains(plan, "Seq Scan on urls") {
		t.Fatalf("query plan still uses Seq Scan on urls:\n%s", plan)
	}
}

func TestRecycleExpiredGuestCode(t *testing.T) {
	repo, db := setupTestDB(t)
	ctx := context.Background()

	// quarantineCutoff mirrors the service's 30-day policy. The repository takes it
	// as a parameter rather than hardcoding NOW(), so these tests probe the SQL
	// predicate at its actual boundary.
	quarantineCutoff := time.Now().Add(-30 * 24 * time.Hour)

	t.Run("guest link expired before the cutoff IS recycled and the alias can be reclaimed", func(t *testing.T) {
		const shortCode = "guest-expired"
		// A guest link that lapsed well before the quarantine cutoff.
		_, err := db.ExecContext(ctx, `
			INSERT INTO urls (short_code, long_url, is_active, created_at, expires_at, user_id)
			VALUES ($1, 'https://old.example.com', true, NOW() - INTERVAL '90 days', NOW() - INTERVAL '60 days', NULL)
		`, shortCode)
		if err != nil {
			t.Fatalf("inserting expired guest link: %v", err)
		}

		// Recycle should succeed
		recycled, err := repo.RecycleExpiredGuestCode(ctx, shortCode, quarantineCutoff)
		if err != nil {
			t.Fatalf("RecycleExpiredGuestCode: %v", err)
		}
		if !recycled {
			t.Fatal("expected recycled == true for expired guest link")
		}

		// Verify row is deactivated in DB
		var isActive bool
		err = db.QueryRowContext(ctx, "SELECT is_active FROM urls WHERE short_code = $1", shortCode).Scan(&isActive)
		if err != nil {
			t.Fatalf("querying is_active: %v", err)
		}
		if isActive {
			t.Fatal("expected is_active to be false after recycling")
		}

		// Alias can now be reclaimed by creating a new link with the same short code
		req := domain.CreateURLRequest{
			LongURL: "https://new.example.com",
		}
		newURL, err := repo.Create(ctx, &req, shortCode)
		if err != nil {
			t.Fatalf("failed to reclaim short code after recycling: %v", err)
		}
		if newURL.ShortCode != shortCode || newURL.LongURL != "https://new.example.com" {
			t.Fatalf("unexpected new URL: %+v", newURL)
		}

		// after recycling, GetStats still resolves to the new active row
		stats, err := repo.GetStats(ctx, shortCode)
		if err != nil {
			t.Fatalf("GetStats: %v", err)
		}
		if stats.ID != newURL.ID {
			t.Fatalf("expected GetStats to resolve to new active row ID %d, got %d", newURL.ID, stats.ID)
		}
		if !stats.IsActive {
			t.Fatal("expected GetStats row to be active")
		}
		if stats.LongURL != "https://new.example.com" {
			t.Fatalf("expected long URL https://new.example.com, got %s", stats.LongURL)
		}
	})

	t.Run("unexpired guest link is NOT recycled", func(t *testing.T) {
		const shortCode = "guest-unexpired"
		// Insert an unexpired guest link (user_id IS NULL, expires_at in the future, is_active = true)
		_, err := db.ExecContext(ctx, `
			INSERT INTO urls (short_code, long_url, is_active, created_at, expires_at, user_id)
			VALUES ($1, 'https://unexpired.example.com', true, NOW(), NOW() + INTERVAL '1 hour', NULL)
		`, shortCode)
		if err != nil {
			t.Fatalf("inserting unexpired guest link: %v", err)
		}

		recycled, err := repo.RecycleExpiredGuestCode(ctx, shortCode, quarantineCutoff)
		if err != nil {
			t.Fatalf("RecycleExpiredGuestCode: %v", err)
		}
		if recycled {
			t.Fatal("expected recycled == false for unexpired guest link")
		}

		// Create with same short code should still return ErrURLDuplicate
		req := domain.CreateURLRequest{
			LongURL: "https://conflict.example.com",
		}
		_, err = repo.Create(ctx, &req, shortCode)
		if !errors.Is(err, domain.ErrURLDuplicate) {
			t.Fatalf("expected ErrURLDuplicate for unexpired guest link, got %v", err)
		}
	})

	t.Run("expired link owned by a USER is NOT recycled", func(t *testing.T) {
		const shortCode = "user-expired"
		// Insert a user first
		var userID int64
		err := db.QueryRowContext(ctx, `
			INSERT INTO users (google_id, email, name, avatar_url)
			VALUES ('gid-12345', 'testuser@example.com', 'Test User', 'https://avatar.com')
			RETURNING id
		`).Scan(&userID)
		if err != nil {
			t.Fatalf("inserting user: %v", err)
		}

		// Insert an expired user-owned link (user_id IS NOT NULL, expires_at in the past, is_active = true)
		_, err = db.ExecContext(ctx, `
			INSERT INTO urls (short_code, long_url, is_active, created_at, expires_at, user_id)
			VALUES ($1, 'https://userlink.example.com', true, NOW() - INTERVAL '2 hour', NOW() - INTERVAL '1 hour', $2)
		`, shortCode, userID)
		if err != nil {
			t.Fatalf("inserting user link: %v", err)
		}

		recycled, err := repo.RecycleExpiredGuestCode(ctx, shortCode, quarantineCutoff)
		if err != nil {
			t.Fatalf("RecycleExpiredGuestCode: %v", err)
		}
		if recycled {
			t.Fatal("expected recycled == false for expired user link")
		}

		// Create with same short code should still return ErrURLDuplicate
		req := domain.CreateURLRequest{
			LongURL: "https://conflict.example.com",
		}
		_, err = repo.Create(ctx, &req, shortCode)
		if !errors.Is(err, domain.ErrURLDuplicate) {
			t.Fatalf("expected ErrURLDuplicate for user-owned link, got %v", err)
		}
	})

	// The quarantine boundary. A link that lapsed an hour ago is expired but still
	// fresh in the wild, so its alias must stay locked. This is the case that fails
	// if the predicate ever regresses to a bare NOW().
	t.Run("guest link expired AFTER the cutoff is still quarantined", func(t *testing.T) {
		const shortCode = "guest-recent"
		_, err := db.ExecContext(ctx, `
			INSERT INTO urls (short_code, long_url, is_active, created_at, expires_at, user_id)
			VALUES ($1, 'https://recent.example.com', true, NOW() - INTERVAL '2 hour', NOW() - INTERVAL '1 hour', NULL)
		`, shortCode)
		if err != nil {
			t.Fatalf("inserting recently expired guest link: %v", err)
		}

		recycled, err := repo.RecycleExpiredGuestCode(ctx, shortCode, quarantineCutoff)
		if err != nil {
			t.Fatalf("RecycleExpiredGuestCode: %v", err)
		}
		if recycled {
			t.Fatal("a link that expired inside the quarantine window was recycled")
		}

		var isActive bool
		if err := db.QueryRowContext(ctx, "SELECT is_active FROM urls WHERE short_code = $1", shortCode).Scan(&isActive); err != nil {
			t.Fatalf("querying is_active: %v", err)
		}
		if !isActive {
			t.Fatal("a quarantined link was deactivated anyway")
		}

		req := domain.CreateURLRequest{LongURL: "https://conflict.example.com"}
		if _, err := repo.Create(ctx, &req, shortCode); !errors.Is(err, domain.ErrURLDuplicate) {
			t.Fatalf("expected ErrURLDuplicate inside the quarantine window, got %v", err)
		}
	})
}

func TestAssertTestDatabase(t *testing.T) {
	tests := []struct {
		name    string
		dbURL   string
		wantErr bool
	}{
		{
			name:    "accepted test database",
			dbURL:   "postgres://appuser:password123@localhost:5432/urlshortener_test?sslmode=disable",
			wantErr: false,
		},
		{
			name:    "rejected production database",
			dbURL:   "postgres://appuser:password123@localhost:5432/urlshortener?sslmode=disable",
			wantErr: true,
		},
		{
			name:    "rejected postgres system database",
			dbURL:   "postgres://appuser:password123@localhost:5432/postgres?sslmode=disable",
			wantErr: true,
		},
		{
			name:    "rejected malformed url",
			dbURL:   "://invalid-url",
			wantErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := assertTestDatabase(tc.dbURL)
			if (err != nil) != tc.wantErr {
				t.Fatalf("assertTestDatabase(%q) error = %v, wantErr = %v", tc.dbURL, err, tc.wantErr)
			}
		})
	}
}
