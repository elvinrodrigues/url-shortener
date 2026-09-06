package handler

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/elvinrodrigues/url-shortener/internal/domain"
	"github.com/elvinrodrigues/url-shortener/internal/service"
	"github.com/golang-jwt/jwt/v5"
)

const testGoogleClientID = "test-client-id"

type fakeAuthUserRepo struct {
	upsertGoogleUser func(ctx context.Context, googleID, email, name, avatarURL string) (*domain.User, error)
	getByID          func(ctx context.Context, id int64) (*domain.User, error)
}

func (f *fakeAuthUserRepo) UpsertGoogleUser(ctx context.Context, googleID, email, name, avatarURL string) (*domain.User, error) {
	if f.upsertGoogleUser != nil {
		return f.upsertGoogleUser(ctx, googleID, email, name, avatarURL)
	}
	return &domain.User{ID: 1, GoogleID: googleID, Email: email, Name: name, AvatarURL: avatarURL}, nil
}

func (f *fakeAuthUserRepo) GetByID(ctx context.Context, id int64) (*domain.User, error) {
	if f.getByID != nil {
		return f.getByID(ctx, id)
	}
	return nil, nil
}

// googleIssuer stands in for Google: it holds a signing key and publishes the
// matching public key over an httptest JWKS endpoint. ID tokens are verified
// locally against that key set, so these handler tests must present genuinely
// signed RS256 tokens rather than a stubbed HTTP response.
type googleIssuer struct {
	kid  string
	key  *rsa.PrivateKey
	jwks *httptest.Server
}

func newGoogleIssuer(t *testing.T) *googleIssuer {
	t.Helper()

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generating rsa key: %v", err)
	}
	iss := &googleIssuer{kid: "test-kid", key: key}

	iss.jwks = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []map[string]string{{
			"kid": iss.kid,
			"kty": "RSA",
			"alg": "RS256",
			"use": "sig",
			"n":   base64.RawURLEncoding.EncodeToString(key.N.Bytes()),
			"e":   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes()),
		}}})
	}))
	t.Cleanup(iss.jwks.Close)

	return iss
}

// sign mints an ID token. Any field in overrides replaces the default claim.
func (g *googleIssuer) sign(t *testing.T, overrides map[string]any) string {
	t.Helper()

	now := time.Now()
	claims := jwt.MapClaims{
		"iss":            "https://accounts.google.com",
		"aud":            testGoogleClientID,
		"sub":            "108124372199876543210",
		"email":          "user@example.com",
		"email_verified": true,
		"name":           "Test User",
		"picture":        "https://example.com/avatar.jpg",
		"iat":            now.Add(-time.Minute).Unix(),
		"exp":            now.Add(time.Hour).Unix(),
	}
	for k, v := range overrides {
		claims[k] = v
	}

	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tok.Header["kid"] = g.kid

	signed, err := tok.SignedString(g.key)
	if err != nil {
		t.Fatalf("signing id token: %v", err)
	}
	return signed
}

func (g *googleIssuer) authService(repo domain.UserRepository) *service.AuthService {
	svc := service.NewAuthService(repo, []byte("secret"), testGoogleClientID)
	svc.SetGoogleJWKSURL(g.jwks.URL)
	return svc
}

func postAuth(t *testing.T, svc *service.AuthService, body string) *httptest.ResponseRecorder {
	t.Helper()

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/auth/google", bytes.NewBufferString(body))
	NewAuthHandler(svc).GoogleAuth(rec, req)
	return rec
}

func decodeError(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()

	var body map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decoding response body: %v", err)
	}
	return body["error"]
}

func TestAuthHandler_GoogleAuth(t *testing.T) {
	t.Run("missing id_token returns 400", func(t *testing.T) {
		iss := newGoogleIssuer(t)

		rec := postAuth(t, iss.authService(&fakeAuthUserRepo{}), `{}`)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected status 400, got %d", rec.Code)
		}
		if got := decodeError(t, rec); got != "id_token is required" {
			t.Fatalf("expected 'id_token is required', got %q", got)
		}
	})

	t.Run("unverifiable token returns 401 and client-safe message", func(t *testing.T) {
		iss := newGoogleIssuer(t)

		rec := postAuth(t, iss.authService(&fakeAuthUserRepo{}), `{"id_token":"not-a-real-token"}`)

		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expected status 401, got %d", rec.Code)
		}
		msg := decodeError(t, rec)
		if !strings.Contains(msg, "could not verify google token") {
			t.Fatalf("expected a client-safe verification message, got %q", msg)
		}
		if strings.Contains(msg, "auth: google token invalid") {
			t.Fatalf("sentinel prefix leaked into the response body: %q", msg)
		}
	})

	t.Run("expired token returns 401", func(t *testing.T) {
		iss := newGoogleIssuer(t)
		expired := iss.sign(t, map[string]any{"exp": time.Now().Add(-time.Hour).Unix()})

		rec := postAuth(t, iss.authService(&fakeAuthUserRepo{}), fmt.Sprintf(`{"id_token":%q}`, expired))

		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expected status 401 for an expired token, got %d", rec.Code)
		}
	})

	t.Run("unverified email claim returns 401", func(t *testing.T) {
		iss := newGoogleIssuer(t)
		token := iss.sign(t, map[string]any{"email_verified": false})

		rec := postAuth(t, iss.authService(&fakeAuthUserRepo{}), fmt.Sprintf(`{"id_token":%q}`, token))

		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expected status 401, got %d", rec.Code)
		}
		msg := decodeError(t, rec)
		if !strings.Contains(msg, "google account email is not verified") {
			t.Fatalf("expected the unverified-email reason, got %q", msg)
		}
		if strings.Contains(msg, "auth: google token invalid") {
			t.Fatalf("sentinel prefix leaked into the response body: %q", msg)
		}
	})

	t.Run("email conflict returns 409 Conflict", func(t *testing.T) {
		iss := newGoogleIssuer(t)
		repo := &fakeAuthUserRepo{
			upsertGoogleUser: func(ctx context.Context, googleID, email, name, avatarURL string) (*domain.User, error) {
				return nil, domain.ErrEmailConflict
			},
		}

		rec := postAuth(t, iss.authService(repo), fmt.Sprintf(`{"id_token":%q}`, iss.sign(t, nil)))

		if rec.Code != http.StatusConflict {
			t.Fatalf("expected status 409, got %d", rec.Code)
		}
		if got := decodeError(t, rec); got != "Email already linked to another account" {
			t.Fatalf("expected 'Email already linked to another account', got %q", got)
		}
	})

	t.Run("database failure returns 500 without leaking Postgres errors", func(t *testing.T) {
		iss := newGoogleIssuer(t)
		repo := &fakeAuthUserRepo{
			upsertGoogleUser: func(ctx context.Context, googleID, email, name, avatarURL string) (*domain.User, error) {
				return nil, fmt.Errorf(`postgres upsert google user: pq: duplicate key value violates unique constraint "users_pkey"`)
			},
		}

		rec := postAuth(t, iss.authService(repo), fmt.Sprintf(`{"id_token":%q}`, iss.sign(t, nil)))

		if rec.Code != http.StatusInternalServerError {
			t.Fatalf("expected status 500, got %d", rec.Code)
		}
		msg := decodeError(t, rec)
		if msg != "Internal server error" {
			t.Fatalf("expected generic 'Internal server error', got %q", msg)
		}
		if strings.Contains(msg, "postgres") || strings.Contains(msg, "pq:") {
			t.Fatalf("internal Postgres error was leaked to client: %q", msg)
		}
	})

	t.Run("successful auth returns 200 and token", func(t *testing.T) {
		iss := newGoogleIssuer(t)

		rec := postAuth(t, iss.authService(&fakeAuthUserRepo{}), fmt.Sprintf(`{"id_token":%q}`, iss.sign(t, nil)))

		if rec.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d (body %q)", rec.Code, rec.Body.String())
		}
		var res domain.AuthResponse
		if err := json.NewDecoder(rec.Body).Decode(&res); err != nil {
			t.Fatalf("decoding response body: %v", err)
		}
		if res.Token == "" {
			t.Fatal("expected non-empty token")
		}
		if res.User == nil || res.User.Email != "user@example.com" {
			t.Fatalf("unexpected user in response: %+v", res.User)
		}
	})
}
