package service

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/elvinrodrigues/url-shortener/internal/domain"
	"github.com/golang-jwt/jwt/v5"
)

type AuthService struct {
	userRepo       domain.UserRepository
	jwtSecret      []byte
	googleClientID string
	httpClient     *http.Client
}

func NewAuthService(userRepo domain.UserRepository, jwtSecret []byte, googleClientID string) *AuthService {
	return &AuthService{
		userRepo:       userRepo,
		jwtSecret:      jwtSecret,
		googleClientID: googleClientID,
		httpClient:     &http.Client{Timeout: 5 * time.Second},
	}
}

func (s *AuthService) SetHTTPClient(client *http.Client) {
	s.httpClient = client
}

type GoogleTokenClaims struct {
	Sub           string      `json:"sub"`
	Email         string      `json:"email"`
	EmailVerified interface{} `json:"email_verified"`
	Name          string      `json:"name"`
	Picture       string      `json:"picture"`
	Aud           string      `json:"aud"`
	Iss           string      `json:"iss"`
}

// googleIssuers are the two spellings Google uses for the `iss` claim. Both are
// valid and which one appears is not contractual, so both must be accepted.
var googleIssuers = map[string]bool{
	"accounts.google.com":         true,
	"https://accounts.google.com": true,
}

// isEmailVerified normalises the email_verified claim.
//
// The tokeninfo endpoint stringifies every claim, so it arrives as "true", while a
// locally decoded ID token carries a real boolean. Accepting both keeps this correct
// if verification later moves to local JWKS validation; anything else — absent,
// null, or an unexpected type — is treated as unverified.
func isEmailVerified(v any) bool {
	switch b := v.(type) {
	case bool:
		return b
	case string:
		return b == "true"
	default:
		return false
	}
}

// validateGoogleClaims decides whether a set of Google claims may be turned into an
// account. It is separated from the HTTP exchange so the security rules are testable
// without a network round trip.
//
// Every message here reaches the client verbatim (the handler surfaces err.Error()),
// so none of them may name server-side configuration.
//
// Token expiry is not checked: tokeninfo only answers 200 for a live token. A move
// to local JWKS validation would have to add an `exp`/`nbf` check here.
func validateGoogleClaims(c GoogleTokenClaims, expectedAud string) error {
	if !googleIssuers[c.Iss] {
		return fmt.Errorf("%w: google token has an untrusted issuer", domain.ErrGoogleTokenInvalid)
	}
	if expectedAud != "" && c.Aud != expectedAud {
		return fmt.Errorf("%w: google token was issued for a different application", domain.ErrGoogleTokenInvalid)
	}
	// sub is the account's permanent identity anchor (see UpsertGoogleUser). An empty
	// one would let every such token collapse onto a single shared row.
	if c.Sub == "" {
		return fmt.Errorf("%w: google token is missing a subject claim", domain.ErrGoogleTokenInvalid)
	}
	if c.Email == "" {
		return fmt.Errorf("%w: google token is missing an email claim", domain.ErrGoogleTokenInvalid)
	}
	// An unverified address proves only that someone typed it. Because a returning
	// user is matched on sub alone, accepting one no longer risks an account
	// takeover, but it would still let anyone mint an account claiming any address.
	if !isEmailVerified(c.EmailVerified) {
		return fmt.Errorf("%w: google account email is not verified", domain.ErrGoogleTokenInvalid)
	}
	return nil
}

type AppClaims struct {
	UserID    int64  `json:"user_id"`
	Email     string `json:"email"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatar_url"`
	jwt.RegisteredClaims
}

func (s *AuthService) AuthenticateGoogle(ctx context.Context, idToken string) (*domain.AuthResponse, error) {
	endpoint := "https://oauth2.googleapis.com/tokeninfo?id_token=" + url.QueryEscape(idToken)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	client := s.httpClient
	if client == nil {
		client = &http.Client{Timeout: 5 * time.Second}
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to verify Google token: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w: invalid or expired Google token", domain.ErrGoogleTokenInvalid)
	}

	var gClaims GoogleTokenClaims
	if err := json.NewDecoder(resp.Body).Decode(&gClaims); err != nil {
		return nil, fmt.Errorf("failed to decode Google token response: %w", err)
	}

	if err := validateGoogleClaims(gClaims, s.googleClientID); err != nil {
		return nil, err
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
