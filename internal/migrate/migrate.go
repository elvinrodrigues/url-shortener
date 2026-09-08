package migrate

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"
	"sort"
	"strings"
)

// DB abstracts *sql.DB and *sql.Conn so Apply can run against a connection pool
// or a single pinned connection.
type DB interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
	BeginTx(ctx context.Context, opts *sql.TxOptions) (*sql.Tx, error)
}

// Apply reads all .sql migration files from files, sorts them by filename,
// and applies unapplied migrations against db in transactional order.
// Each applied migration is recorded in schema_migrations within the same
// transaction. It returns the list of applied migration filenames.
func Apply(ctx context.Context, db DB, files fs.FS) ([]string, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	entries, err := fs.ReadDir(files, ".")
	if err != nil {
		return nil, fmt.Errorf("reading migrations: %w", err)
	}

	var sqlFiles []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			sqlFiles = append(sqlFiles, e.Name())
		}
	}
	sort.Strings(sqlFiles)

	if _, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		filename VARCHAR(255) PRIMARY KEY,
		applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);`); err != nil {
		return nil, fmt.Errorf("creating schema_migrations: %w", err)
	}

	var applied []string
	for _, name := range sqlFiles {
		var exists bool
		err := db.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE filename = $1)", name).Scan(&exists)
		if err != nil {
			return nil, fmt.Errorf("checking migration %s: %w", name, err)
		}
		if exists {
			continue
		}

		content, err := fs.ReadFile(files, name)
		if err != nil {
			return nil, fmt.Errorf("reading migration %s: %w", name, err)
		}

		if err := applyOne(ctx, db, name, content); err != nil {
			return nil, err
		}

		applied = append(applied, name)
	}

	return applied, nil
}

func applyOne(ctx context.Context, db DB, name string, content []byte) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("starting transaction for %s: %w", name, err)
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, string(content)); err != nil {
		return fmt.Errorf("executing migration %s: %w", name, err)
	}

	if _, err := tx.ExecContext(ctx, "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING", name); err != nil {
		return fmt.Errorf("recording migration %s: %w", name, err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("committing migration %s: %w", name, err)
	}

	return nil
}
