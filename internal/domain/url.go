package domain

import (
	"context"
	"time"
)

type URL struct {
	ID         int64
	ShortCode  string
	LongURL    string
	CreatedAt  time.Time
	ExpiresAt  *time.Time
	ClickCount int64
	UserID     *int64
	IsActive   bool
}
type CreateURLRequest struct {
	LongURL    string     `json:"long_url"`
	ExpiresAt  *time.Time `json:"expires_at,omitempty"`
	CustomCode string     `json:"custom_code,omitempty"`
	UserID     *int64
}

type URLRepository interface {
	Create(ctx context.Context, req *CreateURLRequest, shortCode string) (*URL, error)
	GetByCode(ctx context.Context, shortCode string) (*URL, error)
	IncrementClicks(ctx context.Context, shortCode string) error
	Deactivate(ctx context.Context, shortCode string, userID int64) error
	GetStats(ctx context.Context, shortCode string) (*URL, error)
}

type URLService interface {
	Shorten(ctx context.Context, req CreateURLRequest) (*URL, error)
	Redirect(ctx context.Context, code string) (string, error)
	Delete(ctx context.Context, code string,userID int64) error
	GetStats(ctx context.Context, code string) (*URL, error)
}

type URLCache interface{
	Set(ctx context.Context,code,longURL string,ttl time.Duration)error
	Get(ctx context.Context,code string)(string,error)
	Delete(ctx context.Context,code string)error
}
