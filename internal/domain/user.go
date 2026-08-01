package domain

import (
	"context"
	"time"
)

type User struct {
	ID        int64     `json:"id"`
	GoogleID  string    `json:"google_id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	AvatarURL string    `json:"avatar_url"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type UserRepository interface {
	UpsertGoogleUser(ctx context.Context, googleID, email, name, avatarURL string) (*User, error)
	GetByID(ctx context.Context, id int64) (*User, error)
}

type GoogleAuthRequest struct {
	IDToken string `json:"id_token"`
}

type AuthResponse struct {
	Token string `json:"token"`
	User  *User  `json:"user"`
}