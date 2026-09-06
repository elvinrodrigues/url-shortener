package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/elvinrodrigues/url-shortener/internal/domain"
	"github.com/elvinrodrigues/url-shortener/internal/service"
)

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

type authMockTransport func(req *http.Request) *http.Response

func (f authMockTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req), nil
}

func validGoogleTokeninfoJSON() string {
	return `{
		"sub": "108124372199876543210",
		"email": "user@example.com",
		"email_verified": "true",
		"name": "Test User",
		"picture": "https://example.com/avatar.jpg",
		"aud": "test-client-id",
		"iss": "https://accounts.google.com"
	}`
}

func TestAuthHandler_GoogleAuth(t *testing.T) {
	t.Run("missing id_token returns 400", func(t *testing.T) {
		authSvc := service.NewAuthService(&fakeAuthUserRepo{}, []byte("secret"), "test-client-id")
		h := NewAuthHandler(authSvc)

		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/auth/google", bytes.NewBufferString(`{}`))
		h.GoogleAuth(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected status 400, got %d", rec.Code)
		}
		var body map[string]string
		if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
			t.Fatalf("decoding response body: %v", err)
		}
		if body["error"] != "id_token is required" {
			t.Fatalf("expected 'id_token is required', got %q", body["error"])
		}
	})

	t.Run("invalid google token returns 401 and client-safe message", func(t *testing.T) {
		authSvc := service.NewAuthService(&fakeAuthUserRepo{}, []byte("secret"), "test-client-id")
		authSvc.SetHTTPClient(&http.Client{
			Transport: authMockTransport(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusBadRequest,
					Body:       io.NopCloser(strings.NewReader(`{"error_description":"Invalid Value"}`)),
					Header:     make(http.Header),
				}
			}),
		})

		h := NewAuthHandler(authSvc)
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/auth/google", bytes.NewBufferString(`{"id_token":"invalid-token"}`))
		h.GoogleAuth(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expected status 401, got %d", rec.Code)
		}
		var body map[string]string
		if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
			t.Fatalf("decoding response body: %v", err)
		}
		if !strings.Contains(body["error"], "invalid or expired Google token") {
			t.Fatalf("expected error message to contain 'invalid or expired Google token', got %q", body["error"])
		}
		if strings.Contains(body["error"], "auth: google token invalid") {
			t.Fatalf("expected error message NOT to contain sentinel prefix 'auth: google token invalid', got %q", body["error"])
		}
	})

	t.Run("unverified email claim returns 401", func(t *testing.T) {
		unverifiedClaimsJSON := `{
			"sub": "108124372199876543210",
			"email": "user@example.com",
			"email_verified": "false",
			"aud": "test-client-id",
			"iss": "https://accounts.google.com"
		}`

		authSvc := service.NewAuthService(&fakeAuthUserRepo{}, []byte("secret"), "test-client-id")
		authSvc.SetHTTPClient(&http.Client{
			Transport: authMockTransport(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusOK,
					Body:       io.NopCloser(strings.NewReader(unverifiedClaimsJSON)),
					Header:     make(http.Header),
				}
			}),
		})

		h := NewAuthHandler(authSvc)
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/auth/google", bytes.NewBufferString(`{"id_token":"some-token"}`))
		h.GoogleAuth(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expected status 401, got %d", rec.Code)
		}
		var body map[string]string
		if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
			t.Fatalf("decoding response body: %v", err)
		}
		if !strings.Contains(body["error"], "google account email is not verified") {
			t.Fatalf("expected error message to contain 'google account email is not verified', got %q", body["error"])
		}
		if strings.Contains(body["error"], "auth: google token invalid") {
			t.Fatalf("expected error message NOT to contain sentinel prefix 'auth: google token invalid', got %q", body["error"])
		}
	})

	t.Run("email conflict returns 409 Conflict", func(t *testing.T) {
		repo := &fakeAuthUserRepo{
			upsertGoogleUser: func(ctx context.Context, googleID, email, name, avatarURL string) (*domain.User, error) {
				return nil, domain.ErrEmailConflict
			},
		}

		authSvc := service.NewAuthService(repo, []byte("secret"), "test-client-id")
		authSvc.SetHTTPClient(&http.Client{
			Transport: authMockTransport(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusOK,
					Body:       io.NopCloser(strings.NewReader(validGoogleTokeninfoJSON())),
					Header:     make(http.Header),
				}
			}),
		})

		h := NewAuthHandler(authSvc)
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/auth/google", bytes.NewBufferString(`{"id_token":"valid-token"}`))
		h.GoogleAuth(rec, req)

		if rec.Code != http.StatusConflict {
			t.Fatalf("expected status 409, got %d", rec.Code)
		}
		var body map[string]string
		if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
			t.Fatalf("decoding response body: %v", err)
		}
		if body["error"] != "Email already linked to another account" {
			t.Fatalf("expected 'Email already linked to another account', got %q", body["error"])
		}
	})

	t.Run("database failure returns 500 without leaking Postgres errors", func(t *testing.T) {
		repo := &fakeAuthUserRepo{
			upsertGoogleUser: func(ctx context.Context, googleID, email, name, avatarURL string) (*domain.User, error) {
				return nil, fmt.Errorf("postgres upsert google user: pq: duplicate key value violates unique constraint \"urls_pkey\"")
			},
		}

		authSvc := service.NewAuthService(repo, []byte("secret"), "test-client-id")
		authSvc.SetHTTPClient(&http.Client{
			Transport: authMockTransport(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusOK,
					Body:       io.NopCloser(strings.NewReader(validGoogleTokeninfoJSON())),
					Header:     make(http.Header),
				}
			}),
		})

		h := NewAuthHandler(authSvc)
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/auth/google", bytes.NewBufferString(`{"id_token":"valid-token"}`))
		h.GoogleAuth(rec, req)

		if rec.Code != http.StatusInternalServerError {
			t.Fatalf("expected status 500, got %d", rec.Code)
		}
		var body map[string]string
		if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
			t.Fatalf("decoding response body: %v", err)
		}
		if body["error"] != "Internal server error" {
			t.Fatalf("expected generic 'Internal server error', got %q", body["error"])
		}
		if strings.Contains(body["error"], "postgres") || strings.Contains(body["error"], "pq:") {
			t.Fatalf("internal Postgres error was leaked to client: %q", body["error"])
		}
	})

	t.Run("successful auth returns 200 and token", func(t *testing.T) {
		authSvc := service.NewAuthService(&fakeAuthUserRepo{}, []byte("secret"), "test-client-id")
		authSvc.SetHTTPClient(&http.Client{
			Transport: authMockTransport(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusOK,
					Body:       io.NopCloser(strings.NewReader(validGoogleTokeninfoJSON())),
					Header:     make(http.Header),
				}
			}),
		})

		h := NewAuthHandler(authSvc)
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/auth/google", bytes.NewBufferString(`{"id_token":"valid-token"}`))
		h.GoogleAuth(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d", rec.Code)
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
