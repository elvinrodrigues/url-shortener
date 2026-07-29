package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"

	"github.com/elvinrodrigues/url-shortener/internal/ctxlog"
	"github.com/elvinrodrigues/url-shortener/internal/domain"
	"github.com/lib/pq"
)

type URLPostgres struct {
	db *sql.DB
}

func New(db *sql.DB) *URLPostgres {
	return &URLPostgres{db: db}
}

func (r *URLPostgres) Create(ctx context.Context, req *domain.CreateURLRequest, shortCode string) (*domain.URL, error) {
	var url = &domain.URL{}
	query := "INSERT INTO urls (short_code,long_url,expires_at,user_id) values($1,$2,$3,$4) RETURNING id,short_code,long_url,created_at,expires_at,click_count,is_active,user_id"
	err := r.db.QueryRowContext(ctx, query, shortCode, req.LongURL, req.ExpiresAt, req.UserID).Scan(&url.ID, &url.ShortCode, &url.LongURL, &url.CreatedAt, &url.ExpiresAt, &url.ClickCount, &url.IsActive, &url.UserID)

	if err != nil {
		var pqErr *pq.Error
		if errors.As(err, &pqErr) && pqErr.Code == "23505" {
			return nil, domain.ErrURLDuplicate
		}

		return nil, fmt.Errorf("postgres create: %w", err)
	}
	return url, nil
}

func (r *URLPostgres) GetByCode(ctx context.Context, shortCode string) (*domain.URL, error) {
	ctxlog.GetLogger(ctx, slog.Default()).Debug("db querry", "code", shortCode)
	query := "SELECT long_url,expires_at FROM urls WHERE short_code = $1 and is_active=true"
	var url = &domain.URL{}
	err := r.db.QueryRowContext(ctx, query, shortCode).Scan(&url.LongURL, &url.ExpiresAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrURLNotFound
		}
		return nil, fmt.Errorf("postgres get by code: %w", err)
	}
	url.ShortCode = shortCode
	url.IsActive = true
	return url, nil
}
func (r *URLPostgres) IncrementClicks(ctx context.Context, shortCode string) error {
	query := "UPDATE urls SET click_count=click_count+1 where short_code = $1"
	res, err := r.db.ExecContext(ctx, query, shortCode)
	if err != nil {
		return fmt.Errorf("postgres increment clicks exec: %w", err)
	}
	count, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("postgres increment clicks: %w", err)
	}
	if count == 0 {
		return domain.ErrURLNotFound
	}

	return nil
}

func (r *URLPostgres) Deactivate(ctx context.Context, shortCode string, userID int64) error {
	query := "UPDATE urls SET is_active = false where short_code=$1 AND user_id = $2"
	res, err := r.db.ExecContext(ctx, query, shortCode, userID)
	if err != nil {
		return fmt.Errorf("postgres deactivate: %w", err)
	}
	if count, err := res.RowsAffected(); err != nil {
		return fmt.Errorf("postgres deactivate: %w", err)
	} else if count == 0 {
		return domain.ErrURLNotFound
	}
	return nil
}

func (r *URLPostgres) GetStats(ctx context.Context, shortCode string) (*domain.URL, error) {
	query := "SELECT id,short_code,long_url,created_at,expires_at,click_count,is_active,user_id FROM urls WHERE short_code = $1"
	var url = &domain.URL{}
	err := r.db.QueryRowContext(ctx, query, shortCode).Scan(&url.ID, &url.ShortCode, &url.LongURL, &url.CreatedAt, &url.ExpiresAt, &url.ClickCount, &url.IsActive, &url.UserID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrURLNotFound
		}
		return nil, fmt.Errorf("postgres get stats: %w", err)
	}
	return url, nil
}
