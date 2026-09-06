package service

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// googleJWKSURL is Google's published RSA key set for ID tokens.
const googleJWKSURL = "https://www.googleapis.com/oauth2/v3/certs"

const (
	// jwksFallbackTTL is used when the response carries no usable Cache-Control.
	// Google normally advertises several hours; this is a conservative floor.
	jwksFallbackTTL = 1 * time.Hour

	// jwksMinRefreshInterval throttles the unknown-kid refresh path. Key rotation
	// is rare, but `kid` is attacker-controlled: without a floor, a stream of
	// tokens bearing random kids would turn every request into an outbound fetch
	// and make this service a traffic amplifier against Google (and a way to stall
	// our own request goroutines).
	jwksMinRefreshInterval = 1 * time.Minute
)

// googleKeySet caches Google's signing keys, keyed by `kid`.
//
// A single mutex guards everything and is held across the network fetch. That
// serialises concurrent refreshes rather than letting N cache misses become N
// outbound requests; the fetch is bounded by the client's timeout, so the worst
// case is a short queue rather than a stampede.
type googleKeySet struct {
	mu        sync.Mutex
	keys      map[string]*rsa.PublicKey
	staleAt   time.Time // when the cached set must be refetched
	lastFetch time.Time // throttles forced refreshes on an unknown kid

	url    string
	client *http.Client
}

func newGoogleKeySet(client *http.Client) *googleKeySet {
	return &googleKeySet{
		keys:   make(map[string]*rsa.PublicKey),
		url:    googleJWKSURL,
		client: client,
	}
}

// keyFor resolves a `kid` to a public key, refreshing the cached set when it has
// gone stale or when the kid is unknown (bounded by jwksMinRefreshInterval).
func (g *googleKeySet) keyFor(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	if kid == "" {
		return nil, fmt.Errorf("google token header has no kid")
	}

	g.mu.Lock()
	defer g.mu.Unlock()

	now := time.Now()

	if now.After(g.staleAt) {
		if err := g.refreshLocked(ctx, now); err != nil {
			// Serve a stale key rather than failing every sign-in during a Google
			// outage: the key is still cryptographically valid, it is only the
			// freshness guarantee that lapsed.
			if key, ok := g.keys[kid]; ok {
				return key, nil
			}
			return nil, err
		}
	}

	if key, ok := g.keys[kid]; ok {
		return key, nil
	}

	// Unknown kid: either a rotation we have not seen, or a forged header.
	if now.Sub(g.lastFetch) < jwksMinRefreshInterval {
		return nil, fmt.Errorf("no google signing key for kid %q", kid)
	}
	if err := g.refreshLocked(ctx, now); err != nil {
		return nil, err
	}
	if key, ok := g.keys[kid]; ok {
		return key, nil
	}
	return nil, fmt.Errorf("no google signing key for kid %q", kid)
}

// refreshLocked fetches and replaces the key set. The caller must hold g.mu.
func (g *googleKeySet) refreshLocked(ctx context.Context, now time.Time) error {
	g.lastFetch = now

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, g.url, nil)
	if err != nil {
		return fmt.Errorf("building jwks request: %w", err)
	}

	resp, err := g.client.Do(req)
	if err != nil {
		return fmt.Errorf("fetching google jwks: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("fetching google jwks: unexpected status %d", resp.StatusCode)
	}

	var doc struct {
		Keys []struct {
			Kid string `json:"kid"`
			Kty string `json:"kty"`
			Alg string `json:"alg"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&doc); err != nil {
		return fmt.Errorf("decoding google jwks: %w", err)
	}

	fresh := make(map[string]*rsa.PublicKey, len(doc.Keys))
	for _, k := range doc.Keys {
		// Ignore anything that is not an RS256 signing key. Accepting a key whose
		// alg we do not enforce would undermine the parser's method allowlist.
		if k.Kty != "RSA" || (k.Alg != "" && k.Alg != "RS256") || k.Kid == "" {
			continue
		}
		pub, err := rsaPublicKeyFromJWK(k.N, k.E)
		if err != nil {
			continue // a single malformed entry must not void the whole set
		}
		fresh[k.Kid] = pub
	}

	if len(fresh) == 0 {
		return fmt.Errorf("google jwks contained no usable RS256 keys")
	}

	g.keys = fresh
	g.staleAt = now.Add(cacheTTLFromHeader(resp.Header.Get("Cache-Control")))
	return nil
}

// rsaPublicKeyFromJWK rebuilds a public key from the base64url modulus and
// exponent carried in a JWK.
func rsaPublicKeyFromJWK(nB64, eB64 string) (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(nB64)
	if err != nil {
		return nil, fmt.Errorf("decoding jwk modulus: %w", err)
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(eB64)
	if err != nil {
		return nil, fmt.Errorf("decoding jwk exponent: %w", err)
	}
	if len(nBytes) == 0 || len(eBytes) == 0 {
		return nil, fmt.Errorf("jwk modulus or exponent is empty")
	}

	e := new(big.Int).SetBytes(eBytes)
	if !e.IsInt64() || e.Int64() < 3 || e.Int64() > 1<<31-1 {
		return nil, fmt.Errorf("jwk exponent %s out of range", e)
	}

	return &rsa.PublicKey{N: new(big.Int).SetBytes(nBytes), E: int(e.Int64())}, nil
}

// cacheTTLFromHeader extracts max-age from a Cache-Control header, falling back
// to jwksFallbackTTL when it is absent or unusable.
func cacheTTLFromHeader(header string) time.Duration {
	for _, part := range strings.Split(header, ",") {
		part = strings.TrimSpace(part)
		if !strings.HasPrefix(part, "max-age=") {
			continue
		}
		secs, err := strconv.Atoi(strings.TrimPrefix(part, "max-age="))
		if err != nil || secs <= 0 {
			return jwksFallbackTTL
		}
		return time.Duration(secs) * time.Second
	}
	return jwksFallbackTTL
}
