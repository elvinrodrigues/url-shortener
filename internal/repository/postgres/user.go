package postgres

import (
	"context"
	"database/sql"
	"errors"

	"github.com/elvinrodrigues/url-shortener/internal/domain"
	"github.com/lib/pq"
)

func (r *URLPostgres) UpsertGoogleUser(ctx context.Context, googleID, email, name, avatarURL string) (*domain.User, error) {
	query := `
		INSERT INTO users (google_id, email, name, avatar_url, updated_at)
		VALUES ($1, $2, $3, $4, NOW())
		ON CONFLICT (google_id) DO UPDATE
		SET email = EXCLUDED.email,
		    name = EXCLUDED.name,
		    avatar_url = EXCLUDED.avatar_url,
		    updated_at = NOW()
		RETURNING id, google_id, email, name, avatar_url, created_at, updated_at;
	`
	var u domain.User
	err := r.db.QueryRowContext(ctx, query, googleID, email, name, avatarURL).Scan(
		&u.ID, &u.GoogleID, &u.Email, &u.Name, &u.AvatarURL, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		var pqErr *pq.Error
		if errors.As(err, &pqErr) && pqErr.Code == "23505" {
			// Email constraint conflict: update existing record by email
			fallbackQuery := `
				UPDATE users
				SET google_id = $1,
				    name = $3,
				    avatar_url = $4,
				    updated_at = NOW()
				WHERE email = $2
				RETURNING id, google_id, email, name, avatar_url, created_at, updated_at;
			`
			err = r.db.QueryRowContext(ctx, fallbackQuery, googleID, email, name, avatarURL).Scan(
				&u.ID, &u.GoogleID, &u.Email, &u.Name, &u.AvatarURL, &u.CreatedAt, &u.UpdatedAt,
			)
			if err != nil {
				return nil, domain.ErrEmailConflict
			}
			return &u, nil
		}
		return nil, err
	}
	return &u, nil
}

func (r *URLPostgres) GetByID(ctx context.Context, id int64) (*domain.User, error) {
	query := `SELECT id, google_id, email, name, avatar_url, created_at, updated_at FROM users WHERE id = $1`
	var u domain.User
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&u.ID, &u.GoogleID, &u.Email, &u.Name, &u.AvatarURL, &u.CreatedAt, &u.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}
