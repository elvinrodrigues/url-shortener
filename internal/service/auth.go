package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/elvinrodrigues/url-shortener/internal/domain"
	"github.com/golang-jwt/jwt/v5"
)

type AuthService struct {
	userRepo       domain.UserRepository
	jwtSecret      []byte
	googleClientID string
}

func NewAuthService(userRepo domain.UserRepository, jwtSecret []byte, googleClientID string) *AuthService {
	return &AuthService{
		userRepo:       userRepo,
		jwtSecret:      jwtSecret,
		googleClientID: googleClientID,
	}
}

type GoogleTokenClaims struct {
	Sub           string      `json:"sub"`
	Email         string      `json:"email"`
	EmailVerified interface{} `json:"email_verified"`
	Name          string      `json:"name"`
	Picture       string      `json:"picture"`
	Aud           string      `json:"aud"`
}

type AppClaims struct {
	UserID    int64  `json:"user_id"`
	Email     string `json:"email"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatar_url"`
	jwt.RegisteredClaims
}

func (s *AuthService) AuthenticateGoogle(ctx context.Context, idToken string) (*domain.AuthResponse, error) {
	resp, err := http.Get("https://oauth2.googleapis.com/tokeninfo?id_token=" + idToken)
	if err != nil {
		return nil, fmt.Errorf("failed to verify Google token: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, errors.New("invalid or expired Google token")
	}

	var gClaims GoogleTokenClaims
	if err := json.NewDecoder(resp.Body).Decode(&gClaims); err != nil {
		return nil, fmt.Errorf("failed to decode Google token response: %w", err)
	}

	if s.googleClientID != "" && gClaims.Aud != s.googleClientID {
		return nil, fmt.Errorf("google token audience mismatch: token aud=%s vs server=%s", gClaims.Aud, s.googleClientID)
	}

	user, err := s.userRepo.UpsertGoogleUser(ctx, gClaims.Sub, gClaims.Email, gClaims.Name, gClaims.Picture)
	if err != nil {
		return nil, fmt.Errorf("failed to save user: %w", err)
	}

	claims := AppClaims{
		UserID:    user.ID,
		Email:     user.Email,
		Name:      user.Name,
		AvatarURL: user.AvatarURL,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, err := token.SignedString(s.jwtSecret)
	if err != nil {
		return nil, fmt.Errorf("failed to generate app token: %w", err)
	}

	return &domain.AuthResponse{
		Token: tokenStr,
		User:  user,
	}, nil
}
