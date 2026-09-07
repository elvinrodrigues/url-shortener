package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/elvinrodrigues/url-shortener/internal/domain"
	"github.com/golang-jwt/jwt/v5"
)

// fakeService lets each test drive one method's outcome without a database.
type fakeService struct {
	shorten         func(domain.CreateURLRequest) (*domain.URL, error)
	redirect        func(string) (string, error)
	deleteFn        func(string, int64) error
	deleteExpiredFn func(int64) (int64, error)
	getStats        func(string, int64) (*domain.URL, error)
	getUserURLs     func(int64) ([]*domain.URL, error)

	lastShortenRequest      domain.CreateURLRequest
	lastDeleteUserID        int64
	lastDeleteExpiredUserID int64
	lastStatsUserID         int64
}

func (f *fakeService) Shorten(_ context.Context, req domain.CreateURLRequest) (*domain.URL, error) {
	f.lastShortenRequest = req
	if f.shorten != nil {
		return f.shorten(req)
	}
	return &domain.URL{ShortCode: "abc1234", LongURL: req.LongURL}, nil
}

func (f *fakeService) Redirect(_ context.Context, code string) (string, error) {
	if f.redirect != nil {
		return f.redirect(code)
	}
	return "https://example.com", nil
}

func (f *fakeService) Delete(_ context.Context, code string, userID int64) error {
	f.lastDeleteUserID = userID
	if f.deleteFn != nil {
		return f.deleteFn(code, userID)
	}
	return nil
}

func (f *fakeService) DeleteExpired(_ context.Context, userID int64) (int64, error) {
	f.lastDeleteExpiredUserID = userID
	if f.deleteExpiredFn != nil {
		return f.deleteExpiredFn(userID)
	}
	return 0, nil
}

func (f *fakeService) GetStats(_ context.Context, code string, userID int64) (*domain.URL, error) {
	f.lastStatsUserID = userID
	if f.getStats != nil {
		return f.getStats(code, userID)
	}
	return &domain.URL{ShortCode: code, LongURL: "https://example.com", IsActive: true}, nil
}

func (f *fakeService) GetUserURLs(_ context.Context, userID int64) ([]*domain.URL, error) {
	if f.getUserURLs != nil {
		return f.getUserURLs(userID)
	}
	return nil, nil
}

var testSecret = []byte("test-secret")

// newTestMux mirrors the route table and middleware chain wired in cmd/server so
// the tests exercise the same path values and auth composition as production.
func newTestMux(t *testing.T, svc domain.URLService) http.Handler {
	t.Helper()

	h := New(svc, "http://short.test")
	auth := AuthMiddleware(testSecret)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", h.HealthCheck)
	mux.HandleFunc("GET /{code}", h.Redirect)
	mux.Handle("POST /shorten", auth(http.HandlerFunc(h.Shorten)))
	mux.Handle("DELETE /{code}", auth(RequireAuth(http.HandlerFunc(h.Delete))))
	mux.Handle("GET /stats/{code}", auth(RequireAuth(http.HandlerFunc(h.GetStats))))
	mux.Handle("GET /user/urls", auth(RequireAuth(http.HandlerFunc(h.GetUserURLs))))
	mux.Handle("DELETE /user/urls/expired", auth(RequireAuth(http.HandlerFunc(h.DeleteExpired))))
	return mux
}

func tokenFor(t *testing.T, userID int64) string {
	t.Helper()

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, CustomClaims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	})
	signed, err := token.SignedString(testSecret)
	if err != nil {
		t.Fatalf("signing test token: %v", err)
	}
	return signed
}

func do(h http.Handler, req *http.Request) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func errorMessage(t *testing.T, body string) string {
	t.Helper()

	var payload map[string]string
	if err := json.Unmarshal([]byte(body), &payload); err != nil {
		t.Fatalf("response was not a JSON error object: %q", body)
	}
	return payload["error"]
}

// ---------------------------------------------------------------------------
// POST /shorten — status taxonomy
// ---------------------------------------------------------------------------

func TestShorten_StatusTaxonomy(t *testing.T) {
	tests := []struct {
		name       string
		body       string
		serviceErr error
		wantStatus int
	}{
		{name: "created", body: `{"long_url":"https://example.com"}`, wantStatus: http.StatusCreated},
		{name: "malformed json", body: `{"long_url":`, wantStatus: http.StatusBadRequest},
		{name: "duplicate custom code", body: `{"long_url":"https://example.com","custom_code":"taken"}`, serviceErr: domain.ErrURLDuplicate, wantStatus: http.StatusConflict},
		{name: "invalid url", body: `{"long_url":"ftp://example.com"}`, serviceErr: domain.ErrURLInvalid, wantStatus: http.StatusUnprocessableEntity},
		{name: "invalid custom code", body: `{"long_url":"https://example.com","custom_code":"a"}`, serviceErr: domain.ErrCustomCodeInvalid, wantStatus: http.StatusUnprocessableEntity},
		{name: "reserved custom code", body: `{"long_url":"https://example.com","custom_code":"admin"}`, serviceErr: domain.ErrCustomCodeReserved, wantStatus: http.StatusUnprocessableEntity},
		{name: "retry budget exhausted", body: `{"long_url":"https://example.com"}`, serviceErr: domain.ErrURLShortenFailed, wantStatus: http.StatusServiceUnavailable},
		{name: "unexpected failure", body: `{"long_url":"https://example.com"}`, serviceErr: errors.New("boom"), wantStatus: http.StatusInternalServerError},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			svc := &fakeService{}
			if tc.serviceErr != nil {
				svc.shorten = func(domain.CreateURLRequest) (*domain.URL, error) { return nil, tc.serviceErr }
			}

			req := httptest.NewRequest(http.MethodPost, "/shorten", strings.NewReader(tc.body))
			rec := do(newTestMux(t, svc), req)

			if rec.Code != tc.wantStatus {
				t.Fatalf("got %d, want %d (body %q)", rec.Code, tc.wantStatus, rec.Body.String())
			}
			if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "application/json") {
				t.Errorf("got Content-Type %q, want JSON", ct)
			}
		})
	}
}

func TestShorten_ReturnsLocationHeaderAndAbsoluteURL(t *testing.T) {
	svc := &fakeService{}

	req := httptest.NewRequest(http.MethodPost, "/shorten", strings.NewReader(`{"long_url":"https://example.com"}`))
	rec := do(newTestMux(t, svc), req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("got %d, want 201", rec.Code)
	}

	var body CreateURLResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decoding response: %v", err)
	}

	const want = "http://short.test/abc1234"
	if body.ShortURL != want {
		t.Errorf("got short_url %q, want %q", body.ShortURL, want)
	}
	if body.ShortCode != "abc1234" {
		t.Errorf("got short_code %q, want %q", body.ShortCode, "abc1234")
	}
	if got := rec.Header().Get("Location"); got != want {
		t.Errorf("got Location %q, want %q", got, want)
	}
}

// TestShorten_AttachesUserIDOnlyWhenAuthenticated covers the optional-auth
// composition: the same route serves guests and owners, and ownership must come
// from the verified token rather than the request body.
func TestShorten_AttachesUserIDOnlyWhenAuthenticated(t *testing.T) {
	t.Run("guest", func(t *testing.T) {
		svc := &fakeService{}

		req := httptest.NewRequest(http.MethodPost, "/shorten", strings.NewReader(`{"long_url":"https://example.com"}`))
		if rec := do(newTestMux(t, svc), req); rec.Code != http.StatusCreated {
			t.Fatalf("got %d, want 201", rec.Code)
		}

		if svc.lastShortenRequest.UserID != nil {
			t.Fatalf("guest request carried user id %d", *svc.lastShortenRequest.UserID)
		}
	})

	t.Run("authenticated", func(t *testing.T) {
		svc := &fakeService{}

		req := httptest.NewRequest(http.MethodPost, "/shorten", strings.NewReader(`{"long_url":"https://example.com"}`))
		req.Header.Set("Authorization", "Bearer "+tokenFor(t, 99))
		if rec := do(newTestMux(t, svc), req); rec.Code != http.StatusCreated {
			t.Fatalf("got %d, want 201", rec.Code)
		}

		if svc.lastShortenRequest.UserID == nil || *svc.lastShortenRequest.UserID != 99 {
			t.Fatalf("got user id %v, want 99", svc.lastShortenRequest.UserID)
		}
	})

	t.Run("body cannot forge ownership", func(t *testing.T) {
		svc := &fakeService{}

		// UserID is unexported from JSON on CreateURLRequest, so a caller supplying
		// one must be ignored entirely.
		req := httptest.NewRequest(http.MethodPost, "/shorten", strings.NewReader(`{"long_url":"https://example.com","UserID":5,"user_id":5}`))
		if rec := do(newTestMux(t, svc), req); rec.Code != http.StatusCreated {
			t.Fatalf("got %d, want 201", rec.Code)
		}

		if svc.lastShortenRequest.UserID != nil {
			t.Fatalf("request body forged ownership as %d", *svc.lastShortenRequest.UserID)
		}
	})
}

// ---------------------------------------------------------------------------
// GET /{code} — redirect and content-negotiated errors
// ---------------------------------------------------------------------------

func TestRedirect_SendsFoundWithLocation(t *testing.T) {
	svc := &fakeService{redirect: func(string) (string, error) { return "https://example.com/target", nil }}

	rec := do(newTestMux(t, svc), httptest.NewRequest(http.MethodGet, "/abc1234", nil))

	if rec.Code != http.StatusFound {
		t.Fatalf("got %d, want 302", rec.Code)
	}
	if got := rec.Header().Get("Location"); got != "https://example.com/target" {
		t.Fatalf("got Location %q, want the destination", got)
	}
}

func TestRedirect_ErrorsAreContentNegotiated(t *testing.T) {
	tests := []struct {
		name        string
		accept      string
		serviceErr  error
		wantStatus  int
		wantHTML    bool
		wantJSONMsg string
	}{
		{name: "api not found", accept: "application/json", serviceErr: domain.ErrURLNotFound, wantStatus: http.StatusNotFound, wantJSONMsg: "Short URL not found"},
		{name: "api expired", accept: "application/json", serviceErr: domain.ErrURLExpired, wantStatus: http.StatusGone, wantJSONMsg: "Short URL has expired"},
		{name: "api internal", accept: "application/json", serviceErr: errors.New("boom"), wantStatus: http.StatusInternalServerError, wantJSONMsg: "Internal server error"},
		{name: "no accept header defaults to json", serviceErr: domain.ErrURLNotFound, wantStatus: http.StatusNotFound, wantJSONMsg: "Short URL not found"},
		{name: "browser not found", accept: "text/html,application/xhtml+xml", serviceErr: domain.ErrURLNotFound, wantStatus: http.StatusNotFound, wantHTML: true},
		{name: "browser expired", accept: "text/html,application/xhtml+xml", serviceErr: domain.ErrURLExpired, wantStatus: http.StatusGone, wantHTML: true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			svc := &fakeService{redirect: func(string) (string, error) { return "", tc.serviceErr }}

			req := httptest.NewRequest(http.MethodGet, "/abc1234", nil)
			if tc.accept != "" {
				req.Header.Set("Accept", tc.accept)
			}
			rec := do(newTestMux(t, svc), req)

			if rec.Code != tc.wantStatus {
				t.Fatalf("got %d, want %d", rec.Code, tc.wantStatus)
			}

			contentType := rec.Header().Get("Content-Type")
			if tc.wantHTML {
				if !strings.Contains(contentType, "text/html") {
					t.Fatalf("got Content-Type %q, want HTML", contentType)
				}
				if !strings.Contains(rec.Body.String(), "<!DOCTYPE html>") {
					t.Fatal("browser response was not an HTML document")
				}
				return
			}

			if !strings.Contains(contentType, "application/json") {
				t.Fatalf("got Content-Type %q, want JSON", contentType)
			}
			if got := errorMessage(t, rec.Body.String()); got != tc.wantJSONMsg {
				t.Fatalf("got error %q, want %q", got, tc.wantJSONMsg)
			}
		})
	}
}

// TestRedirect_ErrorPageEscapesShortCode guards the reflected short code in the
// generated 404 page against HTML injection. The payloads deliberately contain no
// literal "/" so they stay a single path segment and actually reach the {code}
// route rather than 404ing out of the mux before the page is rendered.
func TestRedirect_ErrorPageEscapesShortCode(t *testing.T) {
	// mustNot is the fully decoded payload. Matching the exact payload rather than a
	// prefix like "<svg" matters because the page legitimately contains its own SVG
	// icons, which would make a prefix assertion fail even on correctly escaped output.
	tests := []struct {
		name    string
		rawPath string
		mustNot string
	}{
		{name: "img onerror", rawPath: "/%3Cimg%20src=x%20onerror=alert(1)%3E", mustNot: "<img src=x onerror=alert(1)>"},
		{name: "attribute break out", rawPath: "/%22%3E%3Cscript%3E", mustNot: "\"><script>"},
		{name: "svg onload", rawPath: "/%3Csvg%20onload=alert(1)%3E", mustNot: "<svg onload=alert(1)>"},
		{name: "ampersand entity", rawPath: "/%26lt%3Bscript%26gt%3B", mustNot: "&lt;script&gt;"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			svc := &fakeService{redirect: func(string) (string, error) { return "", domain.ErrURLNotFound }}

			req := httptest.NewRequest(http.MethodGet, tc.rawPath, nil)
			req.Header.Set("Accept", "text/html")
			rec := do(newTestMux(t, svc), req)

			// Sanity check that the payload reached the error page at all, so this
			// test cannot pass by never rendering anything.
			if rec.Code != http.StatusNotFound {
				t.Fatalf("got status %d, want 404 — payload never reached the {code} route", rec.Code)
			}
			if rec.Body.Len() == 0 {
				t.Fatal("no error page was rendered")
			}
			if !strings.Contains(rec.Body.String(), "TARGET PATH") {
				t.Fatal("the rendered body is not the styled error page")
			}

			if strings.Contains(rec.Body.String(), tc.mustNot) {
				t.Fatalf("the short code was reflected unescaped: found %q in the page", tc.mustNot)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Protected routes
// ---------------------------------------------------------------------------

func TestProtectedRoutes_RequireAuthentication(t *testing.T) {
	routes := []struct {
		name   string
		method string
		path   string
	}{
		{"delete", http.MethodDelete, "/abc1234"},
		{"stats", http.MethodGet, "/stats/abc1234"},
		{"user urls", http.MethodGet, "/user/urls"},
		{"delete expired", http.MethodDelete, "/user/urls/expired"},
	}

	for _, route := range routes {
		t.Run(route.name+" without token", func(t *testing.T) {
			rec := do(newTestMux(t, &fakeService{}), httptest.NewRequest(route.method, route.path, nil))

			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("got %d, want 401", rec.Code)
			}
			if got := errorMessage(t, rec.Body.String()); got != "Authentication required" {
				t.Fatalf("got error %q", got)
			}
		})

		t.Run(route.name+" with malformed header", func(t *testing.T) {
			req := httptest.NewRequest(route.method, route.path, nil)
			req.Header.Set("Authorization", "Basic dXNlcjpwYXNz")

			if rec := do(newTestMux(t, &fakeService{}), req); rec.Code != http.StatusUnauthorized {
				t.Fatalf("got %d, want 401", rec.Code)
			}
		})

		t.Run(route.name+" with wrongly signed token", func(t *testing.T) {
			forged := jwt.NewWithClaims(jwt.SigningMethodHS256, CustomClaims{UserID: 1})
			signed, err := forged.SignedString([]byte("not-the-server-secret"))
			if err != nil {
				t.Fatalf("signing: %v", err)
			}

			req := httptest.NewRequest(route.method, route.path, nil)
			req.Header.Set("Authorization", "Bearer "+signed)

			if rec := do(newTestMux(t, &fakeService{}), req); rec.Code != http.StatusUnauthorized {
				t.Fatalf("got %d, want 401", rec.Code)
			}
		})

		t.Run(route.name+" with expired token", func(t *testing.T) {
			expired := jwt.NewWithClaims(jwt.SigningMethodHS256, CustomClaims{
				UserID: 1,
				RegisteredClaims: jwt.RegisteredClaims{
					ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Hour)),
				},
			})
			signed, err := expired.SignedString(testSecret)
			if err != nil {
				t.Fatalf("signing: %v", err)
			}

			req := httptest.NewRequest(route.method, route.path, nil)
			req.Header.Set("Authorization", "Bearer "+signed)

			if rec := do(newTestMux(t, &fakeService{}), req); rec.Code != http.StatusUnauthorized {
				t.Fatalf("got %d, want 401", rec.Code)
			}
		})
	}
}

// TestDelete_ForwardsTokenUserIDAndHidesOtherUsersLinks pins the IDOR behaviour:
// the caller's identity comes from the token, and a link owned by someone else is
// reported as missing rather than forbidden so codes cannot be enumerated.
func TestDelete_ForwardsTokenUserIDAndHidesOtherUsersLinks(t *testing.T) {
	t.Run("owner", func(t *testing.T) {
		svc := &fakeService{deleteFn: func(string, int64) error { return nil }}

		req := httptest.NewRequest(http.MethodDelete, "/abc1234", nil)
		req.Header.Set("Authorization", "Bearer "+tokenFor(t, 7))
		rec := do(newTestMux(t, svc), req)

		if rec.Code != http.StatusNoContent {
			t.Fatalf("got %d, want 204", rec.Code)
		}
		if svc.lastDeleteUserID != 7 {
			t.Fatalf("service received user id %d, want 7", svc.lastDeleteUserID)
		}
	})

	t.Run("someone else's link is 404 not 403", func(t *testing.T) {
		svc := &fakeService{deleteFn: func(string, int64) error { return domain.ErrURLNotFound }}

		req := httptest.NewRequest(http.MethodDelete, "/abc1234", nil)
		req.Header.Set("Authorization", "Bearer "+tokenFor(t, 8))
		rec := do(newTestMux(t, svc), req)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("got %d, want 404", rec.Code)
		}
	})
}

func TestGetStats_StatusTaxonomy(t *testing.T) {
	tests := []struct {
		name       string
		serviceErr error
		wantStatus int
	}{
		{name: "ok", wantStatus: http.StatusOK},
		{name: "missing", serviceErr: domain.ErrURLNotFound, wantStatus: http.StatusNotFound},
		{name: "not owner", serviceErr: domain.ErrURLForbidden, wantStatus: http.StatusForbidden},
		{name: "unexpected", serviceErr: errors.New("boom"), wantStatus: http.StatusInternalServerError},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			svc := &fakeService{}
			if tc.serviceErr != nil {
				svc.getStats = func(string, int64) (*domain.URL, error) { return nil, tc.serviceErr }
			}

			req := httptest.NewRequest(http.MethodGet, "/stats/abc1234", nil)
			req.Header.Set("Authorization", "Bearer "+tokenFor(t, 7))
			rec := do(newTestMux(t, svc), req)

			if rec.Code != tc.wantStatus {
				t.Fatalf("got %d, want %d", rec.Code, tc.wantStatus)
			}
		})
	}
}

// TestGetUserURLs_EmptyListIsJSONArray guards the frontend contract: a user with
// no links must receive [] rather than null.
func TestGetUserURLs_EmptyListIsJSONArray(t *testing.T) {
	svc := &fakeService{getUserURLs: func(int64) ([]*domain.URL, error) { return nil, nil }}

	req := httptest.NewRequest(http.MethodGet, "/user/urls", nil)
	req.Header.Set("Authorization", "Bearer "+tokenFor(t, 7))
	rec := do(newTestMux(t, svc), req)

	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}
	if got := strings.TrimSpace(rec.Body.String()); got != "[]" {
		t.Fatalf("got body %q, want []", got)
	}
}

func TestHealthCheck(t *testing.T) {
	rec := do(newTestMux(t, &fakeService{}), httptest.NewRequest(http.MethodGet, "/health", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"healthy"`) {
		t.Fatalf("got body %q", rec.Body.String())
	}
}

func TestCORSMiddleware_ShortCircuitsPreflight(t *testing.T) {
	var reached bool
	handler := CORSMiddleware(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { reached = true }))

	rec := do(handler, httptest.NewRequest(http.MethodOptions, "/shorten", nil))

	if rec.Code != http.StatusNoContent {
		t.Fatalf("got %d, want 204", rec.Code)
	}
	if reached {
		t.Fatal("preflight was passed to the wrapped handler")
	}
	if got := rec.Header().Get("Access-Control-Allow-Methods"); !strings.Contains(got, "DELETE") {
		t.Fatalf("got allowed methods %q", got)
	}
}

func TestDeleteExpired(t *testing.T) {
	t.Run("success returns 200 with deleted count", func(t *testing.T) {
		svc := &fakeService{
			deleteExpiredFn: func(userID int64) (int64, error) {
				if userID != 42 {
					t.Fatalf("expected userID 42, got %d", userID)
				}
				return 3, nil
			},
		}
		mux := newTestMux(t, svc)

		req := httptest.NewRequest(http.MethodDelete, "/user/urls/expired", nil)
		req.Header.Set("Authorization", "Bearer "+tokenFor(t, 42))
		rec := httptest.NewRecorder()

		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d (body: %s)", rec.Code, rec.Body.String())
		}

		var resp DeleteExpiredResponse
		if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
			t.Fatalf("decoding response: %v", err)
		}
		if resp.Deleted != 3 {
			t.Fatalf("expected deleted count 3, got %d", resp.Deleted)
		}
	})

	t.Run("unauthenticated request returns 401 via middleware", func(t *testing.T) {
		svc := &fakeService{}
		mux := newTestMux(t, svc)

		req := httptest.NewRequest(http.MethodDelete, "/user/urls/expired", nil)
		rec := httptest.NewRecorder()

		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expected status 401, got %d", rec.Code)
		}
	})

	t.Run("direct handler invocation without userID context returns 401", func(t *testing.T) {
		svc := &fakeService{}
		h := New(svc, "http://short.test")

		req := httptest.NewRequest(http.MethodDelete, "/user/urls/expired", nil)
		rec := httptest.NewRecorder()

		h.DeleteExpired(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expected status 401, got %d", rec.Code)
		}
		if got := errorMessage(t, rec.Body.String()); got != "Unauthorized" {
			t.Fatalf("got error %q, want Unauthorized", got)
		}
	})

	t.Run("service error returns 500", func(t *testing.T) {
		svc := &fakeService{
			deleteExpiredFn: func(userID int64) (int64, error) {
				return 0, errors.New("db error")
			},
		}
		mux := newTestMux(t, svc)

		req := httptest.NewRequest(http.MethodDelete, "/user/urls/expired", nil)
		req.Header.Set("Authorization", "Bearer "+tokenFor(t, 42))
		rec := httptest.NewRecorder()

		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusInternalServerError {
			t.Fatalf("expected status 500, got %d", rec.Code)
		}
	})
}
