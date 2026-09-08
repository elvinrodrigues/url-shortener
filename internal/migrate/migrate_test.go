package migrate_test

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"testing"
	"testing/fstest"
	"time"

	"github.com/elvinrodrigues/url-shortener/internal/migrate"
	"github.com/elvinrodrigues/url-shortener/migrations"
	_ "github.com/lib/pq"
)

func setupTestConn(t *testing.T) (*sql.Conn, string) {
	t.Helper()
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		t.Skip("skipping test: TEST_DATABASE_URL not set")
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		t.Fatalf("opening database: %v", err)
	}

	ctx := context.Background()
	conn, err := db.Conn(ctx)
	if err != nil {
		db.Close()
		t.Fatalf("obtaining connection: %v", err)
	}

	schemaName := fmt.Sprintf("migtest_%d", time.Now().UnixNano())
	if _, err := conn.ExecContext(ctx, fmt.Sprintf("CREATE SCHEMA %s", schemaName)); err != nil {
		conn.Close()
		db.Close()
		t.Fatalf("creating schema %s: %v", schemaName, err)
	}

	if _, err := conn.ExecContext(ctx, fmt.Sprintf("SET search_path TO %s, public", schemaName)); err != nil {
		conn.Close()
		db.Close()
		t.Fatalf("setting search_path: %v", err)
	}

	t.Cleanup(func() {
		_, _ = conn.ExecContext(context.Background(), "SET search_path TO public")
		_, _ = conn.ExecContext(context.Background(), fmt.Sprintf("DROP SCHEMA %s CASCADE", schemaName))
		conn.Close()
		db.Close()
	})

	return conn, schemaName
}

func TestApply_FreshSchema(t *testing.T) {
	conn, _ := setupTestConn(t)
	ctx := context.Background()

	applied, err := migrate.Apply(ctx, conn, migrations.FS)
	if err != nil {
		t.Fatalf("Apply failed: %v", err)
	}

	expected := []string{
		"001_create_urls.sql",
		"002_create_users.sql",
		"003_users_google_id_identity_anchor.sql",
		"004_urls_short_code_full_index.sql",
	}
	if len(applied) != len(expected) {
		t.Fatalf("expected %d applied migrations, got %d: %v", len(expected), len(applied), applied)
	}
	for i, name := range expected {
		if applied[i] != name {
			t.Errorf("applied[%d] = %q, expected %q", i, applied[i], name)
		}
	}

	rows, err := conn.QueryContext(ctx, "SELECT filename FROM schema_migrations ORDER BY filename")
	if err != nil {
		t.Fatalf("querying schema_migrations: %v", err)
	}
	defer rows.Close()

	var recorded []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatalf("scanning schema_migrations row: %v", err)
		}
		recorded = append(recorded, name)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterating schema_migrations rows: %v", err)
	}

	if len(recorded) != len(expected) {
		t.Fatalf("expected %d recorded migrations, got %d: %v", len(expected), len(recorded), recorded)
	}
	for i, name := range expected {
		if recorded[i] != name {
			t.Errorf("recorded[%d] = %q, expected %q", i, recorded[i], name)
		}
	}

	// Verify tables exist
	var count int
	if err := conn.QueryRowContext(ctx, "SELECT COUNT(*) FROM urls").Scan(&count); err != nil {
		t.Errorf("urls table query failed: %v", err)
	}
	if err := conn.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&count); err != nil {
		t.Errorf("users table query failed: %v", err)
	}
}

func TestApply_SecondApplyIsNoop(t *testing.T) {
	conn, _ := setupTestConn(t)
	ctx := context.Background()

	appliedFirst, err := migrate.Apply(ctx, conn, migrations.FS)
	if err != nil {
		t.Fatalf("first Apply failed: %v", err)
	}
	if len(appliedFirst) == 0 {
		t.Fatalf("first Apply should have applied migrations")
	}

	appliedSecond, err := migrate.Apply(ctx, conn, migrations.FS)
	if err != nil {
		t.Fatalf("second Apply failed: %v", err)
	}
	if len(appliedSecond) != 0 {
		t.Fatalf("expected 0 applied migrations on second run, got %d: %v", len(appliedSecond), appliedSecond)
	}

	var count int
	if err := conn.QueryRowContext(ctx, "SELECT COUNT(*) FROM schema_migrations").Scan(&count); err != nil {
		t.Fatalf("querying schema_migrations count: %v", err)
	}
	if count != len(appliedFirst) {
		t.Fatalf("expected count %d, got %d", len(appliedFirst), count)
	}
}

func TestApply_SkipAlreadyRecorded(t *testing.T) {
	conn, _ := setupTestConn(t)
	ctx := context.Background()

	// Pre-create schema_migrations and record the broken migration file
	if _, err := conn.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		filename VARCHAR(255) PRIMARY KEY,
		applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);`); err != nil {
		t.Fatalf("creating schema_migrations: %v", err)
	}

	if _, err := conn.ExecContext(ctx, "INSERT INTO schema_migrations (filename) VALUES ($1)", "001_broken.sql"); err != nil {
		t.Fatalf("inserting into schema_migrations: %v", err)
	}

	badFS := fstest.MapFS{
		"001_broken.sql": &fstest.MapFile{Data: []byte("THIS IS INTENTIONALLY INVALID SQL SYNTAX;")},
	}

	applied, err := migrate.Apply(ctx, conn, badFS)
	if err != nil {
		t.Fatalf("expected Apply to skip already-recorded broken file, but got error: %v", err)
	}
	if len(applied) != 0 {
		t.Fatalf("expected 0 applied migrations, got %d: %v", len(applied), applied)
	}
}

func TestApply_FilenameOrder(t *testing.T) {
	conn, _ := setupTestConn(t)
	ctx := context.Background()

	orderedFS := fstest.MapFS{
		"002_second.sql": &fstest.MapFile{Data: []byte("INSERT INTO test_exec_order (step, name) VALUES (2, 'second');")},
		"001_first.sql":  &fstest.MapFile{Data: []byte("CREATE TABLE test_exec_order (step INT, name TEXT); INSERT INTO test_exec_order (step, name) VALUES (1, 'first');")},
		"003_third.sql":  &fstest.MapFile{Data: []byte("INSERT INTO test_exec_order (step, name) VALUES (3, 'third');")},
	}

	applied, err := migrate.Apply(ctx, conn, orderedFS)
	if err != nil {
		t.Fatalf("Apply failed: %v", err)
	}

	expected := []string{"001_first.sql", "002_second.sql", "003_third.sql"}
	if len(applied) != len(expected) {
		t.Fatalf("expected %d applied migrations, got %d: %v", len(expected), len(applied), applied)
	}
	for i, name := range expected {
		if applied[i] != name {
			t.Errorf("applied[%d] = %q, expected %q", i, applied[i], name)
		}
	}

	rows, err := conn.QueryContext(ctx, "SELECT name FROM test_exec_order ORDER BY step")
	if err != nil {
		t.Fatalf("querying test_exec_order: %v", err)
	}
	defer rows.Close()

	var names []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			t.Fatalf("scanning name: %v", err)
		}
		names = append(names, n)
	}

	expectedNames := []string{"first", "second", "third"}
	if len(names) != len(expectedNames) {
		t.Fatalf("expected %v, got %v", expectedNames, names)
	}
	for i, n := range expectedNames {
		if names[i] != n {
			t.Errorf("names[%d] = %q, expected %q", i, names[i], n)
		}
	}
}

func TestApply_UpgradePath(t *testing.T) {
	conn, schemaName := setupTestConn(t)
	ctx := context.Background()

	// Simulate docker-entrypoint-initdb.d: run 001 and 002 raw with NO schema_migrations
	content001, err := migrations.FS.ReadFile("001_create_urls.sql")
	if err != nil {
		t.Fatalf("reading 001_create_urls.sql: %v", err)
	}
	if _, err := conn.ExecContext(ctx, string(content001)); err != nil {
		t.Fatalf("executing raw 001_create_urls.sql: %v", err)
	}

	content002, err := migrations.FS.ReadFile("002_create_users.sql")
	if err != nil {
		t.Fatalf("reading 002_create_users.sql: %v", err)
	}
	if _, err := conn.ExecContext(ctx, string(content002)); err != nil {
		t.Fatalf("executing raw 002_create_users.sql: %v", err)
	}

	// Now run Apply. It must succeed, record ALL FOUR migrations, and leave every index present.
	applied, err := migrate.Apply(ctx, conn, migrations.FS)
	if err != nil {
		t.Fatalf("Apply on pre-existing database failed: %v", err)
	}

	expected := []string{
		"001_create_urls.sql",
		"002_create_users.sql",
		"003_users_google_id_identity_anchor.sql",
		"004_urls_short_code_full_index.sql",
	}
	if len(applied) != len(expected) {
		t.Fatalf("expected %d applied migrations, got %d: %v", len(expected), len(applied), applied)
	}

	// Assert every index exists via pg_indexes rather than assuming
	rows, err := conn.QueryContext(ctx, "SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = 'urls'", schemaName)
	if err != nil {
		t.Fatalf("querying pg_indexes for urls: %v", err)
	}
	defer rows.Close()

	indexMap := make(map[string]bool)
	for rows.Next() {
		var idxName string
		if err := rows.Scan(&idxName); err != nil {
			t.Fatalf("scanning indexname: %v", err)
		}
		indexMap[idxName] = true
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterating index rows: %v", err)
	}

	expectedIndexes := []string{
		"idx_urls_short_code",
		"idx_urls_user_created",
		"idx_urls_expires_at",
		"idx_urls_short_code_all",
	}
	for _, idx := range expectedIndexes {
		if !indexMap[idx] {
			t.Errorf("expected index %q to exist, found: %v", idx, indexMap)
		}
	}
}

// TestApply_TransactionRollbackOnFailure covers a failing migration leaving no
// partial state and no tracking row.
//
// Note what this does NOT prove: lib/pq sends a multi-statement Exec over the
// simple query protocol, which Postgres already wraps in an implicit
// transaction, so the DDL below rolls back even with applyOne's explicit
// transaction removed (verified). The explicit wrapper earns its place by
// making the DDL atomic with its schema_migrations row — that is the property
// TestApply_RollsBackDDLWhenRecordingFails pins.
func TestApply_TransactionRollbackOnFailure(t *testing.T) {
	conn, schemaName := setupTestConn(t)
	ctx := context.Background()

	// Multi-statement migration where second statement fails
	failingFS := fstest.MapFS{
		"001_failing.sql": &fstest.MapFile{
			Data: []byte("CREATE TABLE tx_check (id INT); SELECT 1/0;"),
		},
	}

	_, err := migrate.Apply(ctx, conn, failingFS)
	if err == nil {
		t.Fatalf("expected Apply to fail on division by zero")
	}

	// Verify tx_check table was rolled back and does not exist
	var tableExists bool
	err = conn.QueryRowContext(ctx,
		"SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'tx_check')",
		schemaName,
	).Scan(&tableExists)
	if err != nil {
		t.Fatalf("checking table existence: %v", err)
	}
	if tableExists {
		t.Errorf("tx_check table should have rolled back, but still exists")
	}

	// Verify not recorded in schema_migrations
	var recExists bool
	err = conn.QueryRowContext(ctx,
		"SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE filename = '001_failing.sql')",
	).Scan(&recExists)
	if err != nil {
		t.Fatalf("checking schema_migrations: %v", err)
	}
	if recExists {
		t.Errorf("failing migration should not be recorded in schema_migrations")
	}
}

// TestApply_RollsBackDDLWhenRecordingFails pins the property the explicit
// transaction in applyOne actually buys: a migration's DDL and its
// schema_migrations row commit together or not at all.
//
// The setup makes the DDL succeed and only the bookkeeping INSERT fail, by
// pre-creating the tracking table with a CHECK that rejects this one filename.
// Without the wrapper the DDL would already be committed by the time the INSERT
// is rejected, leaving a migration applied but unrecorded — so the next run
// would apply it a second time.
func TestApply_RollsBackDDLWhenRecordingFails(t *testing.T) {
	conn, schemaName := setupTestConn(t)
	ctx := context.Background()

	// Apply's own CREATE TABLE IF NOT EXISTS becomes a no-op, so this definition
	// (with the extra constraint) is the one in force.
	if _, err := conn.ExecContext(ctx, `
		CREATE TABLE schema_migrations (
			filename VARCHAR(255) PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			CONSTRAINT reject_poisoned CHECK (filename <> '001_poisoned.sql')
		)`); err != nil {
		t.Fatalf("pre-creating tracking table: %v", err)
	}

	files := fstest.MapFS{
		"001_poisoned.sql": &fstest.MapFile{
			Data: []byte("CREATE TABLE ddl_check (id INT);"),
		},
	}

	if _, err := migrate.Apply(ctx, conn, files); err == nil {
		t.Fatal("expected Apply to fail when the migration cannot be recorded")
	}

	var tableExists bool
	if err := conn.QueryRowContext(ctx,
		"SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'ddl_check')",
		schemaName,
	).Scan(&tableExists); err != nil {
		t.Fatalf("checking table existence: %v", err)
	}
	if tableExists {
		t.Error("ddl_check survived a failed recording: a migration's DDL and its schema_migrations row are not atomic")
	}
}
