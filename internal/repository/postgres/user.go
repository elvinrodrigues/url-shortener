package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/elvinrodrigues/url-shortener/internal/domain"
	"github.com/lib/pq"
)

// UpsertGoogleUser resolves a Google identity to an account row.
//
// google_id (Google's `sub`) is the sole identity anchor, and deliberately so. It is
// stable and immutable for the life of an account, whereas an email address is
// neither: users rename them, and a Workspace admin can delete an account and
// reassign its address to a different person. Matching a returning user on anything
// but sub means whoever currently controls an address inherits the account that
// address used to belong to.
//
// Email is therefore a mutable attribute, refreshed from the token on every sign-in
// and never used to locate a row. Migration 003 drops the UNIQUE constraint that
// made it behave like a key.
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
			// Reachable only where migration 003 has not been applied and the legacy
			// UNIQUE(email) constraint survives. Failing the sign-in is the correct
			// outcome: the previous behaviour "recovered" here by reassigning the
			// existing row's google_id, which handed that user's account and every
			// link they own to the new token holder.
			return nil, domain.ErrEmailConflict
		}
		return nil, fmt.Errorf("postgres upsert google user: %w", err)
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
