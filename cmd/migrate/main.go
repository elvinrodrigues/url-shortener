package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/elvinrodrigues/url-shortener/internal/db"
	"github.com/elvinrodrigues/url-shortener/internal/migrate"
	"github.com/elvinrodrigues/url-shortener/migrations"
	_ "github.com/lib/pq"
)

// We do NOT auto-migrate on server startup. Multiple server instances starting
// concurrently would race on DDL, and coupling schema changes to process start
// makes a bad migration much harder to back out. A separate command is the
// deliberate choice.
func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		logger.Error("DATABASE_URL environment variable is required")
		os.Exit(1)
	}

	dbConn, err := db.Connect(databaseURL)
	if err != nil {
		logger.Error("database connection error", "error", err)
		os.Exit(1)
	}
	defer dbConn.Close()

	ctx := context.Background()
	applied, err := migrate.Apply(ctx, dbConn, migrations.FS)
	if err != nil {
		logger.Error("migration failed", "error", err)
		os.Exit(1)
	}

	logger.Info("migrations completed", "applied", len(applied))
}
