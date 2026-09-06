package service

import (
	"context"
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
	httpClient     *http.Client
	googleKeys     *googleKeySet
}

func NewAuthService(userRepo domain.UserRepository, jwtSecret []byte, googleClientID string) *AuthService {
	client := &http.Client{Timeout: 5 * time.Second}
	return &AuthService{
		userRepo:       userRepo,
		jwtSecret:      jwtSecret,
		googleClientID: googleClientID,
		httpClient:     client,
		googleKeys:     newGoogleKeySet(client),
	}
}

// SetHTTPClient swaps the transport used for outbound calls, including the JWKS
// fetch. Intended for tests.
func (s *AuthService) SetHTTPClient(client *http.Client) {
	s.httpClient = client
	if s.googleKeys != nil {
		s.googleKeys.client = client
	}
}

// SetGoogleJWKSURL overrides where signing keys are fetched from. Intended for
// tests that serve a key set from an httptest server.
func (s *AuthService) SetGoogleJWKSURL(url string) {
	if s.googleKeys != nil {
		s.googleKeys.url = url
	}
}

// googleIDClaims is the subset of an ID token this service reads. Embedding
// RegisteredClaims is what makes the parser validate `exp` and `nbf` for us —
// with the tokeninfo endpoint gone, nothing else checks token lifetime.
type googleIDClaims struct {
	Email         string `json:"email"`
	EmailVerified any    `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
	jwt.RegisteredClaims
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

// validateGoogleClaims decides whether a set of already-verified Google claims may
// be turned into an account. It owns policy only; authenticity is settled earlier.
//
// Signature, algorithm, `exp` and `nbf` are enforced by verifyGoogleIDToken before
// anything reaches here, so a caller must never invoke this on unverified claims —
// every field below is attacker-supplied until that signature check has passed.
//
// Every message here reaches the client verbatim (the handler surfaces err.Error()),
// so none of them may name server-side configuration.
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

// verifyGoogleIDToken checks an ID token's signature against Google's published
// keys and returns its claims.
//
// Signature and lifetime were previously delegated to Google's tokeninfo
// endpoint. Verifying locally removes a network round trip from every sign-in
// and a hard dependency on that endpoint, but it moves three obligations here:
//
//   - Algorithm. WithValidMethods pins RS256, and the parser enforces it before
//     the keyfunc runs. Without it, "alg":"none" is accepted outright and an
//     HS256 token can be forged by signing with Google's *public* key, which is
//     published — a complete authentication bypass.
//   - Lifetime. `exp` and `nbf` are validated by the parser via RegisteredClaims;
//     WithExpirationRequired additionally rejects a token that omits `exp`
//     entirely rather than treating it as never-expiring.
//   - Key identity. The `kid` header selects the key, so an unknown kid must
//     fail rather than fall back to any available key.
func (s *AuthService) verifyGoogleIDToken(ctx context.Context, idToken string) (GoogleTokenClaims, error) {
	parser := jwt.NewParser(
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithExpirationRequired(),
	)

	var claims googleIDClaims
	_, err := parser.ParseWithClaims(idToken, &claims, func(t *jwt.Token) (any, error) {
		kid, _ := t.Header["kid"].(string)
		return s.googleKeys.keyFor(ctx, kid)
	})
	if err != nil {
		return GoogleTokenClaims{}, fmt.Errorf("%w: %s", domain.ErrGoogleTokenInvalid, "could not verify google token")
	}

	// An ID token's `aud` is a single client ID, but the claim is defined as a
	// string-or-array so the library models it as a slice.
	var aud string
	if len(claims.Audience) > 0 {
		aud = claims.Audience[0]
	}

	return GoogleTokenClaims{
		Sub:           claims.Subject,
		Email:         claims.Email,
		EmailVerified: claims.EmailVerified,
		Name:          claims.Name,
		Picture:       claims.Picture,
		Aud:           aud,
		Iss:           claims.Issuer,
	}, nil
}

func (s *AuthService) AuthenticateGoogle(ctx context.Context, idToken string) (*domain.AuthResponse, error) {
	gClaims, err := s.verifyGoogleIDToken(ctx, idToken)
	if err != nil {
		return nil, err
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
