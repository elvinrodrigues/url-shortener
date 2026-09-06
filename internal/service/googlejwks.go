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

	// jwksMinRefreshInterval is the floor between outbound fetches, whatever
	// prompted them — a stale set, an unknown kid, or a previous failure.
	//
	// It has to cover all three. `kid` is attacker-controlled, so a stream of
	// forged kids would otherwise become one fetch per request; and a failing
	// fetch never advances staleAt, so a Google outage would leave every
	// subsequent sign-in retrying immediately. Either path makes this service a
	// traffic amplifier against Google and stalls our own goroutines.
	jwksMinRefreshInterval = 1 * time.Minute

	// jwksFetchTimeout bounds a refresh independently of the injected client, so
	// a client configured without a timeout cannot pin the write lock forever.
	jwksFetchTimeout = 5 * time.Second
)

// googleKeySet caches Google's signing keys, keyed by `kid`.
//
// Reads take the read lock so a sign-in presenting a known, fresh key never
// queues behind an in-flight refresh. Only the refresh path takes the write
// lock, and it holds it across the fetch so N concurrent misses collapse into
// one outbound request rather than N.
type googleKeySet struct {
	mu        sync.RWMutex
	keys      map[string]*rsa.PublicKey
	staleAt   time.Time // when the cached set must be refetched
	lastFetch time.Time // floor between outbound fetches, stamped even on failure

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

	// Fast path: a known key from a set that is still fresh needs no write lock, so
	// ordinary sign-ins never queue behind someone else's refresh.
	g.mu.RLock()
	key, known := g.keys[kid]
	fresh := time.Now().Before(g.staleAt)
	g.mu.RUnlock()
	if known && fresh {
		return key, nil
	}

	g.mu.Lock()
	defer g.mu.Unlock()

	// Re-check under the write lock: another goroutine may have refreshed while
	// this one waited, which is what collapses concurrent misses into one fetch.
	now := time.Now()
	key, known = g.keys[kid]
	if known && now.Before(g.staleAt) {
		return key, nil
	}

	// A single throttle covers every reason to refresh — stale set, unknown kid,
	// or recovering from a failed fetch. refreshLocked stamps lastFetch before it
	// does anything, so a failure throttles the next attempt just as a success
	// does; without that, an outage never advances staleAt and every sign-in
	// retries immediately.
	if now.Sub(g.lastFetch) >= jwksMinRefreshInterval {
		if err := g.refreshLocked(ctx, now); err != nil {
			// Stale-if-error: a cached key is still cryptographically valid, only
			// its freshness guarantee lapsed. Better than failing every sign-in.
			if cached, ok := g.keys[kid]; ok {
				return cached, nil
			}
			return nil, err
		}
		if refreshed, ok := g.keys[kid]; ok {
			return refreshed, nil
		}
		return nil, fmt.Errorf("no google signing key for kid %q", kid)
	}

	// Throttled. Serve what we have rather than failing a legitimate sign-in.
	if known {
		return key, nil
	}
	return nil, fmt.Errorf("no google signing key for kid %q", kid)
}

// refreshLocked fetches and replaces the key set. The caller must hold g.mu.
func (g *googleKeySet) refreshLocked(ctx context.Context, now time.Time) error {
	g.lastFetch = now

	// Detached from the caller's cancellation. This fetch populates a cache shared
	// by every sign-in queued behind the write lock, so one client disconnecting
	// must not fail it for all of them — the same reasoning the redirect path uses
	// for its singleflight read.
	fetchCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), jwksFetchTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(fetchCtx, http.MethodGet, g.url, nil)
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
