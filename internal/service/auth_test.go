package service

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/elvinrodrigues/url-shortener/internal/domain"
	"github.com/golang-jwt/jwt/v5"
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

// ---------------------------------------------------------------------------
// Google ID token verification
//
// Signature and lifetime are checked locally against Google's published keys, so
// these tests stand up a real key set over httptest and sign genuine RS256
// tokens. The adversarial cases below are the whole point: each one is an
// authentication bypass if the corresponding control is missing.
// ---------------------------------------------------------------------------

type googleSigner struct {
	kid string
	key *rsa.PrivateKey
}

func newGoogleSigner(t *testing.T, kid string) *googleSigner {
	t.Helper()

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generating rsa key: %v", err)
	}
	return &googleSigner{kid: kid, key: key}
}

func (g *googleSigner) jwk() map[string]string {
	return map[string]string{
		"kid": g.kid,
		"kty": "RSA",
		"alg": "RS256",
		"use": "sig",
		"n":   base64.RawURLEncoding.EncodeToString(g.key.N.Bytes()),
		"e":   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(g.key.E)).Bytes()),
	}
}

func (g *googleSigner) sign(t *testing.T, claims jwt.MapClaims) string {
	t.Helper()

	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tok.Header["kid"] = g.kid

	signed, err := tok.SignedString(g.key)
	if err != nil {
		t.Fatalf("signing id token: %v", err)
	}
	return signed
}

// jwksServer publishes the given signers' public keys, counting fetches so the
// caching and refresh-throttling tests can assert on outbound traffic.
func jwksServer(t *testing.T, hits *atomic.Int64, signers ...*googleSigner) *httptest.Server {
	t.Helper()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if hits != nil {
			hits.Add(1)
		}
		keys := make([]map[string]string, 0, len(signers))
		for _, s := range signers {
			keys = append(keys, s.jwk())
		}
		w.Header().Set("Cache-Control", "public, max-age=3600")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": keys})
	}))
	t.Cleanup(srv.Close)
	return srv
}

func newAuthServiceForTest(t *testing.T, jwksURL string) *AuthService {
	t.Helper()

	svc := NewAuthService(nil, []byte("app-secret"), testAud)
	svc.SetGoogleJWKSURL(jwksURL)
	return svc
}

func validIDTokenClaims() jwt.MapClaims {
	now := time.Now()
	return jwt.MapClaims{
		"iss":            "https://accounts.google.com",
		"aud":            testAud,
		"sub":            "108124372199876543210",
		"email":          "user@example.com",
		"email_verified": true,
		"name":           "Example User",
		"picture":        "https://example.com/avatar",
		"iat":            now.Add(-time.Minute).Unix(),
		"exp":            now.Add(time.Hour).Unix(),
	}
}

func TestVerifyGoogleIDToken_AcceptsAGenuineToken(t *testing.T) {
	signer := newGoogleSigner(t, "kid-1")
	svc := newAuthServiceForTest(t, jwksServer(t, nil, signer).URL)

	claims, err := svc.verifyGoogleIDToken(context.Background(), signer.sign(t, validIDTokenClaims()))
	if err != nil {
		t.Fatalf("a genuine token was rejected: %v", err)
	}

	if claims.Sub != "108124372199876543210" {
		t.Errorf("got sub %q", claims.Sub)
	}
	if claims.Email != "user@example.com" {
		t.Errorf("got email %q", claims.Email)
	}
	if claims.Aud != testAud {
		t.Errorf("got aud %q, want %q", claims.Aud, testAud)
	}
	if claims.Iss != "https://accounts.google.com" {
		t.Errorf("got iss %q", claims.Iss)
	}
	// A real ID token carries email_verified as a bool, unlike tokeninfo's string.
	if !isEmailVerified(claims.EmailVerified) {
		t.Errorf("email_verified did not survive as verified: %#v", claims.EmailVerified)
	}
	// The claims must satisfy the existing policy gate unchanged.
	if err := validateGoogleClaims(claims, testAud); err != nil {
		t.Errorf("verified claims failed policy validation: %v", err)
	}
}

// TestVerifyGoogleIDToken_RejectsForgedAndStaleTokens is the security core. Each
// subtest is a full authentication bypass if its control is absent.
func TestVerifyGoogleIDToken_RejectsForgedAndStaleTokens(t *testing.T) {
	signer := newGoogleSigner(t, "kid-1")
	jwks := jwksServer(t, nil, signer)

	t.Run("alg none is refused", func(t *testing.T) {
		// Hand-built because the library refuses to sign "none" without an explicit
		// opt-in. An unsigned token is trivially forgeable by anyone.
		claims, _ := json.Marshal(validIDTokenClaims())
		header, _ := json.Marshal(map[string]string{"alg": "none", "typ": "JWT", "kid": "kid-1"})
		unsigned := base64.RawURLEncoding.EncodeToString(header) + "." +
			base64.RawURLEncoding.EncodeToString(claims) + "."

		svc := newAuthServiceForTest(t, jwks.URL)
		if _, err := svc.verifyGoogleIDToken(context.Background(), unsigned); err == nil {
			t.Fatal("an unsigned alg=none token was accepted")
		}
	})

	t.Run("HS256 algorithm confusion is refused", func(t *testing.T) {
		// Google's signing key is public. If HMAC were accepted, an attacker could
		// sign a token with that public key as the shared secret and be believed.
		tok := jwt.NewWithClaims(jwt.SigningMethodHS256, validIDTokenClaims())
		tok.Header["kid"] = "kid-1"
		forged, err := tok.SignedString(signer.key.N.Bytes())
		if err != nil {
			t.Fatalf("signing forged token: %v", err)
		}

		svc := newAuthServiceForTest(t, jwks.URL)
		if _, err := svc.verifyGoogleIDToken(context.Background(), forged); err == nil {
			t.Fatal("an HS256 token signed with the public key was accepted")
		}
	})

	// RS512 is the case that actually pins WithValidMethods. "none" and HS256 are
	// already blocked a second way — the keyfunc hands back an *rsa.PublicKey, and
	// those methods reject it on type — so they pass with or without the allowlist.
	// RS512 verifies against the very same *rsa.PublicKey, so only the explicit
	// RS256 allowlist stands between it and acceptance.
	t.Run("a non-RS256 rsa algorithm is refused", func(t *testing.T) {
		tok := jwt.NewWithClaims(jwt.SigningMethodRS512, validIDTokenClaims())
		tok.Header["kid"] = signer.kid
		downgraded, err := tok.SignedString(signer.key)
		if err != nil {
			t.Fatalf("signing RS512 token: %v", err)
		}

		svc := newAuthServiceForTest(t, jwks.URL)
		if _, err := svc.verifyGoogleIDToken(context.Background(), downgraded); err == nil {
			t.Fatal("an RS512 token was accepted; the algorithm allowlist is not being enforced")
		}
	})

	t.Run("expired token is refused", func(t *testing.T) {
		claims := validIDTokenClaims()
		claims["exp"] = time.Now().Add(-time.Hour).Unix()

		svc := newAuthServiceForTest(t, jwks.URL)
		if _, err := svc.verifyGoogleIDToken(context.Background(), signer.sign(t, claims)); err == nil {
			t.Fatal("an expired token was accepted")
		}
	})

	t.Run("token with no exp is refused", func(t *testing.T) {
		claims := validIDTokenClaims()
		delete(claims, "exp")

		svc := newAuthServiceForTest(t, jwks.URL)
		if _, err := svc.verifyGoogleIDToken(context.Background(), signer.sign(t, claims)); err == nil {
			t.Fatal("a token without exp was accepted as never-expiring")
		}
	})

	t.Run("not-yet-valid token is refused", func(t *testing.T) {
		claims := validIDTokenClaims()
		claims["nbf"] = time.Now().Add(time.Hour).Unix()

		svc := newAuthServiceForTest(t, jwks.URL)
		if _, err := svc.verifyGoogleIDToken(context.Background(), signer.sign(t, claims)); err == nil {
			t.Fatal("a token that is not yet valid was accepted")
		}
	})

	t.Run("unknown kid is refused", func(t *testing.T) {
		stranger := newGoogleSigner(t, "kid-unknown")

		svc := newAuthServiceForTest(t, jwks.URL)
		if _, err := svc.verifyGoogleIDToken(context.Background(), stranger.sign(t, validIDTokenClaims())); err == nil {
			t.Fatal("a token signed by an unpublished key was accepted")
		}
	})

	t.Run("right kid but wrong key is refused", func(t *testing.T) {
		// The signature must actually verify — matching kid alone is not enough.
		impostor := &googleSigner{kid: "kid-1", key: newGoogleSigner(t, "x").key}

		svc := newAuthServiceForTest(t, jwks.URL)
		if _, err := svc.verifyGoogleIDToken(context.Background(), impostor.sign(t, validIDTokenClaims())); err == nil {
			t.Fatal("a token signed by the wrong key was accepted under a valid kid")
		}
	})

	t.Run("garbage is refused", func(t *testing.T) {
		svc := newAuthServiceForTest(t, jwks.URL)
		if _, err := svc.verifyGoogleIDToken(context.Background(), "not-a-jwt"); err == nil {
			t.Fatal("a malformed token was accepted")
		}
	})
}

// TestVerifyGoogleIDToken_ErrorsAreClientSafe guards the response body: the
// handler surfaces this message on a 401, so it must not describe internals.
func TestVerifyGoogleIDToken_ErrorsAreClientSafe(t *testing.T) {
	signer := newGoogleSigner(t, "kid-1")
	svc := newAuthServiceForTest(t, jwksServer(t, nil, signer).URL)

	_, err := svc.verifyGoogleIDToken(context.Background(), "not-a-jwt")
	if err == nil {
		t.Fatal("malformed token was accepted")
	}
	if !errors.Is(err, domain.ErrGoogleTokenInvalid) {
		t.Fatalf("error does not wrap the sentinel, so the handler cannot map it to 401: %v", err)
	}
	for _, leak := range []string{"rsa", "signature is invalid", "jwks", "http"} {
		if strings.Contains(strings.ToLower(err.Error()), leak) {
			t.Errorf("error message leaks internal detail %q: %v", leak, err)
		}
	}
}

// TestGoogleKeySet_CachesAndThrottles pins the two traffic controls. `kid` is
// attacker-controlled, so without throttling a stream of random kids would turn
// each sign-in attempt into an outbound fetch against Google.
func TestGoogleKeySet_CachesAndThrottles(t *testing.T) {
	signer := newGoogleSigner(t, "kid-1")

	t.Run("the key set is fetched once and reused", func(t *testing.T) {
		var hits atomic.Int64
		svc := newAuthServiceForTest(t, jwksServer(t, &hits, signer).URL)

		for i := range 5 {
			if _, err := svc.verifyGoogleIDToken(context.Background(), signer.sign(t, validIDTokenClaims())); err != nil {
				t.Fatalf("verification %d failed: %v", i, err)
			}
		}

		if got := hits.Load(); got != 1 {
			t.Fatalf("got %d jwks fetches for 5 verifications, want 1", got)
		}
	})

	t.Run("unknown kids do not each trigger a fetch", func(t *testing.T) {
		var hits atomic.Int64
		svc := newAuthServiceForTest(t, jwksServer(t, &hits, signer).URL)

		for i := range 10 {
			stranger := &googleSigner{kid: fmt.Sprintf("kid-forged-%d", i), key: signer.key}
			if _, err := svc.verifyGoogleIDToken(context.Background(), stranger.sign(t, validIDTokenClaims())); err == nil {
				t.Fatalf("probe %d with a forged kid was accepted", i)
			}
		}

		// One initial population, plus at most one throttled refresh.
		if got := hits.Load(); got > 2 {
			t.Fatalf("10 forged kids caused %d jwks fetches; refresh is not throttled", got)
		}
	})
}

// mutableJWKS is a key set a test can rotate or fail at will, so the outage and
// rotation paths can be exercised rather than assumed.
type mutableJWKS struct {
	mu      sync.Mutex
	signers []*googleSigner
	failing bool
	hits    atomic.Int64
	srv     *httptest.Server
}

func newMutableJWKS(t *testing.T, signers ...*googleSigner) *mutableJWKS {
	t.Helper()

	m := &mutableJWKS{signers: signers}
	m.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		m.hits.Add(1)

		m.mu.Lock()
		failing, signers := m.failing, append([]*googleSigner(nil), m.signers...)
		m.mu.Unlock()

		if failing {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		keys := make([]map[string]string, 0, len(signers))
		for _, s := range signers {
			keys = append(keys, s.jwk())
		}
		w.Header().Set("Cache-Control", "public, max-age=3600")
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": keys})
	}))
	t.Cleanup(m.srv.Close)
	return m
}

func (m *mutableJWKS) setFailing(v bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.failing = v
}

func (m *mutableJWKS) publish(signers ...*googleSigner) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.signers = signers
}

// TestGoogleKeySet_SurvivesAnOutage covers the two controls that only matter
// when Google is unreachable: the fetch throttle must still apply (a failed
// refresh never advances staleAt, so without it every sign-in would retry), and
// an already-cached key must keep working.
func TestGoogleKeySet_SurvivesAnOutage(t *testing.T) {
	signer := newGoogleSigner(t, "kid-1")

	t.Run("a failing endpoint is not retried on every sign-in", func(t *testing.T) {
		jwks := newMutableJWKS(t, signer)
		jwks.setFailing(true)

		svc := newAuthServiceForTest(t, jwks.srv.URL)
		for range 20 {
			if _, err := svc.verifyGoogleIDToken(context.Background(), signer.sign(t, validIDTokenClaims())); err == nil {
				t.Fatal("verification succeeded with no keys available")
			}
		}

		if got := jwks.hits.Load(); got > 2 {
			t.Fatalf("20 sign-in attempts during an outage caused %d fetches; the throttle is bypassed", got)
		}
	})

	t.Run("a cached key keeps working after the set goes stale", func(t *testing.T) {
		jwks := newMutableJWKS(t, signer)
		svc := newAuthServiceForTest(t, jwks.srv.URL)

		if _, err := svc.verifyGoogleIDToken(context.Background(), signer.sign(t, validIDTokenClaims())); err != nil {
			t.Fatalf("priming the cache failed: %v", err)
		}

		// Google goes down and the cached set ages out.
		jwks.setFailing(true)
		svc.googleKeys.mu.Lock()
		svc.googleKeys.staleAt = time.Now().Add(-time.Hour)
		svc.googleKeys.lastFetch = time.Now().Add(-2 * jwksMinRefreshInterval)
		svc.googleKeys.mu.Unlock()

		if _, err := svc.verifyGoogleIDToken(context.Background(), signer.sign(t, validIDTokenClaims())); err != nil {
			t.Fatalf("a stale but cryptographically valid key was not used during an outage: %v", err)
		}
	})
}

// TestGoogleKeySet_PicksUpRotation covers the refresh-after-throttle path. Every
// other test runs inside the throttle window, so without this the branch that
// actually adopts a rotated key is never executed.
func TestGoogleKeySet_PicksUpRotation(t *testing.T) {
	oldKey := newGoogleSigner(t, "kid-old")
	newKey := newGoogleSigner(t, "kid-new")

	jwks := newMutableJWKS(t, oldKey)
	svc := newAuthServiceForTest(t, jwks.srv.URL)

	if _, err := svc.verifyGoogleIDToken(context.Background(), oldKey.sign(t, validIDTokenClaims())); err != nil {
		t.Fatalf("the original key failed: %v", err)
	}

	// Google rotates. Within the throttle window the new kid is still unknown.
	jwks.publish(newKey)
	if _, err := svc.verifyGoogleIDToken(context.Background(), newKey.sign(t, validIDTokenClaims())); err == nil {
		t.Fatal("a rotated key was adopted without a refresh, so the throttle is not applied")
	}

	// Once the window elapses the rotation must be picked up.
	svc.googleKeys.mu.Lock()
	svc.googleKeys.lastFetch = time.Now().Add(-2 * jwksMinRefreshInterval)
	svc.googleKeys.mu.Unlock()

	if _, err := svc.verifyGoogleIDToken(context.Background(), newKey.sign(t, validIDTokenClaims())); err != nil {
		t.Fatalf("the rotated key was never adopted after the throttle elapsed: %v", err)
	}
}

// TestGoogleKeySet_IgnoresNonRS256Keys covers the ingest filter. A published key
// advertising a different algorithm must not enter the cache, or the parser's
// RS256 allowlist would be verifying against a key we never vetted.
func TestGoogleKeySet_IgnoresNonRS256Keys(t *testing.T) {
	signer := newGoogleSigner(t, "kid-1")

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		jwk := signer.jwk()
		jwk["alg"] = "RS512" // not an RS256 signing key
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []map[string]string{jwk}})
	}))
	t.Cleanup(srv.Close)

	svc := newAuthServiceForTest(t, srv.URL)
	if _, err := svc.verifyGoogleIDToken(context.Background(), signer.sign(t, validIDTokenClaims())); err == nil {
		t.Fatal("a key advertising a non-RS256 algorithm was admitted to the cache")
	}
}
