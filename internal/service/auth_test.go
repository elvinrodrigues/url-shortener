package service

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

// validClaims is a token that passes every gate. Each test mutates one field so a
// failure names exactly which rule fired.
func validClaims() GoogleTokenClaims {
	return GoogleTokenClaims{
		Sub:           "108124372199876543210",
		Email:         "user@example.com",
		EmailVerified: "true",
		Name:          "Example User",
		Picture:       "https://lh3.googleusercontent.com/a/default",
		Aud:           "test-client-id.apps.googleusercontent.com",
		Iss:           "https://accounts.google.com",
	}
}

const testAud = "test-client-id.apps.googleusercontent.com"

// TestIsEmailVerified covers the shapes the claim actually arrives in. tokeninfo
// stringifies every value, so "true" is the production case today; a bool is what a
// locally decoded ID token would carry. Anything else must read as unverified rather
// than as an error the caller might overlook.
func TestIsEmailVerified(t *testing.T) {
	tests := []struct {
		name string
		in   any
		want bool
	}{
		{"tokeninfo string true", "true", true},
		{"decoded bool true", true, true},
		{"tokeninfo string false", "false", false},
		{"decoded bool false", false, false},
		{"absent claim decodes to nil", nil, false},
		{"json number", float64(1), false},
		{"capitalised string is not accepted", "TRUE", false},
		{"numeric string is not accepted", "1", false},
		{"empty string", "", false},
		{"unexpected object", map[string]any{"v": true}, false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := isEmailVerified(tc.in); got != tc.want {
				t.Fatalf("isEmailVerified(%#v) = %v, want %v", tc.in, got, tc.want)
			}
		})
	}
}

func TestValidateGoogleClaims_AcceptsWellFormedTokens(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*GoogleTokenClaims)
	}{
		{"bare issuer spelling", func(c *GoogleTokenClaims) { c.Iss = "accounts.google.com" }},
		{"https issuer spelling", func(c *GoogleTokenClaims) { c.Iss = "https://accounts.google.com" }},
		{"boolean email_verified", func(c *GoogleTokenClaims) { c.EmailVerified = true }},
		{"empty name and picture are optional", func(c *GoogleTokenClaims) { c.Name, c.Picture = "", "" }},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			c := validClaims()
			tc.mutate(&c)

			if err := validateGoogleClaims(c, testAud); err != nil {
				t.Fatalf("well-formed token was rejected: %v", err)
			}
		})
	}
}

func TestValidateGoogleClaims_RejectsBadTokens(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*GoogleTokenClaims)
	}{
		// Issuer.
		{"missing issuer", func(c *GoogleTokenClaims) { c.Iss = "" }},
		{"foreign issuer", func(c *GoogleTokenClaims) { c.Iss = "https://accounts.evil.com" }},
		{"issuer suffix attack", func(c *GoogleTokenClaims) { c.Iss = "https://accounts.google.com.evil.com" }},
		{"issuer prefix attack", func(c *GoogleTokenClaims) { c.Iss = "https://evil.com/accounts.google.com" }},

		// Audience: a token minted for a different application must not be accepted.
		{"foreign audience", func(c *GoogleTokenClaims) { c.Aud = "someone-elses-app.apps.googleusercontent.com" }},
		{"empty audience", func(c *GoogleTokenClaims) { c.Aud = "" }},

		// Subject: the identity anchor. An empty one would collapse every such token
		// onto a single shared row.
		{"missing subject", func(c *GoogleTokenClaims) { c.Sub = "" }},

		// Email.
		{"missing email", func(c *GoogleTokenClaims) { c.Email = "" }},
		{"unverified email string", func(c *GoogleTokenClaims) { c.EmailVerified = "false" }},
		{"unverified email bool", func(c *GoogleTokenClaims) { c.EmailVerified = false }},
		{"absent email_verified claim", func(c *GoogleTokenClaims) { c.EmailVerified = nil }},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			c := validClaims()
			tc.mutate(&c)

			if err := validateGoogleClaims(c, testAud); err == nil {
				t.Fatal("token was accepted, want rejection")
			}
		})
	}
}

// TestValidateGoogleClaims_UnsetAudienceSkipsCheck pins the pre-existing escape
// hatch: an unconfigured client ID disables the audience comparison rather than
// failing every sign-in. Every other gate still applies.
func TestValidateGoogleClaims_UnsetAudienceSkipsCheck(t *testing.T) {
	c := validClaims()
	c.Aud = "anything-at-all"

	if err := validateGoogleClaims(c, ""); err != nil {
		t.Fatalf("unset expected audience should skip the check, got %v", err)
	}

	c.EmailVerified = "false"
	if err := validateGoogleClaims(c, ""); err == nil {
		t.Fatal("an unset audience must not disable the remaining checks")
	}
}

// TestValidateGoogleClaims_ErrorsDoNotLeakServerConfig guards the response body.
// The auth handler surfaces err.Error() verbatim to the caller, so a message naming
// the server's own client ID would disclose it to anyone sending a wrong-audience
// token — which is exactly what the previous formatted error did.
func TestValidateGoogleClaims_ErrorsDoNotLeakServerConfig(t *testing.T) {
	const serverAud = "super-secret-server-client-id.apps.googleusercontent.com"

	c := validClaims()
	c.Aud = "attacker-controlled-value"

	err := validateGoogleClaims(c, serverAud)
	if err == nil {
		t.Fatal("audience mismatch was accepted")
	}
	if strings.Contains(err.Error(), serverAud) {
		t.Fatalf("error message disclosed the server's client ID: %q", err)
	}
}

type roundTripFunc func(req *http.Request) *http.Response

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req), nil
}

func TestAuthenticateGoogle_TokenEscaping(t *testing.T) {
	var capturedReq *http.Request
	customClient := &http.Client{
		Transport: roundTripFunc(func(req *http.Request) *http.Response {
			capturedReq = req
			return &http.Response{
				StatusCode: http.StatusBadRequest,
				Body:       io.NopCloser(strings.NewReader(`{}`)),
				Header:     make(http.Header),
			}
		}),
	}

	authSvc := &AuthService{
		httpClient: customClient,
	}

	tokenWithSpecialChars := "token_with_&audience=attacker#fragment"
	_, _ = authSvc.AuthenticateGoogle(context.Background(), tokenWithSpecialChars)

	if capturedReq == nil {
		t.Fatal("expected request to be made, but capturedReq is nil")
	}

	if strings.Contains(capturedReq.URL.RawQuery, "&audience=") {
		t.Errorf("raw query contains unescaped parameter injection: %q", capturedReq.URL.RawQuery)
	}
	if capturedReq.URL.Fragment != "" {
		t.Errorf("expected empty URL fragment, got %q", capturedReq.URL.Fragment)
	}

	query := capturedReq.URL.Query()
	if len(query) != 1 {
		t.Fatalf("expected exactly 1 query parameter, got %d: %v", len(query), query)
	}
	if got := query.Get("id_token"); got != tokenWithSpecialChars {
		t.Errorf("expected id_token to decode to %q, got %q", tokenWithSpecialChars, got)
	}
}
