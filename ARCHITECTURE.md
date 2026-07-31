# Architecture Decisions

## Day 1 — Schema Design (urls table)

**id: BIGSERIAL**
Used instead of SERIAL (32-bit) because a URL shortener can realistically scale
into billions of rows over time. SERIAL overflows at ~2.1 billion, and migrating
a primary key type on a live table at scale is painful (requires downtime or a
careful online migration). BIGSERIAL costs nothing extra at low scale and removes
the ceiling entirely — a one-way door decision made correctly upfront.

**created_at / expires_at: TIMESTAMPTZ (not TIMESTAMP)**
TIMESTAMPTZ stores all values normalized to UTC internally, regardless of the
inserting session's timezone. Plain TIMESTAMP stores a timezone-less clock value,
which is ambiguous the moment app servers, the DB, and developers' machines aren't
all in the same timezone — a classic source of "which URL expired first" bugs.
Always use TIMESTAMPTZ in Postgres; never plain TIMESTAMP.

**Soft delete (is_active) instead of hard DELETE**
Deactivating a row (is_active = false) preserves data for auditing/recovery
instead of permanently destroying it. The partial indexes (below) filter on
is_active = true, so soft-deleted rows never slow down active-URL queries —
the index physically excludes them. Tradeoff: the table grows forever since rows
are never purged. Acceptable for now since deleted rows are expected to be a
small fraction of total rows; would need a background archival job if that ratio
ever inverted.

**short_code: VARCHAR(30), not UNIQUE at the column level**
Length of 30 leaves headroom for custom/vanity codes (e.g. "my-awesome-link"),
not just Base62-generated codes (which only need ~7-8 chars even at BIGINT scale).
Uniqueness is enforced via idx_urls_short_code (below) instead of a plain UNIQUE
column constraint, since the custom index does double duty — see below.

**Three partial indexes**

1. `idx_urls_short_code` — UNIQUE, WHERE is_active = true, INCLUDE (long_url,
   expires_at, is_active). This is the redirect hot path: every single redirect
   looks up by short_code. INCLUDE stores the extra columns directly in the index,
   enabling an Index Only Scan — Postgres never touches the table heap, skipping
   a second disk read. The partial WHERE means the index only covers live URLs,
   keeping it small and fast, and also means uniqueness is enforced only among
   active rows — a soft-deleted short_code can be reused by a new URL.

2. `idx_urls_user_created` — WHERE is_active = true, on (user_id, created_at DESC).
   Supports the user dashboard: "list my URLs, most recent first," excluding
   deleted ones without a separate filter step.

3. `idx_urls_expires_at` — WHERE expires_at IS NOT NULL AND is_active = true.
   Supports a future expiry-cleanup background job: quickly find active URLs
   that have an expiration set, without scanning rows that never expire.

**Known limitation:** user_id has no foreign key constraint yet (no users table
exists — auth isn't in scope for Day 1). It's currently just a nullable BIGINT.
Anonymous URLs (user_id = NULL) also have no path to deactivation via the
Deactivate repository method, since `WHERE user_id = $2` can never match NULL.
This is intentional for now — anonymous URLs are effectively permanent until
an admin-level deletion path or auth system is added.

## Day 1 — Hrs 5-8: Config, DB Pool, Service/Handler Wiring

**config.Load(): fail-fast on DATABASE_URL, graceful fallback on PORT**
DATABASE_URL has no safe default — without it, nothing works, so a missing
value returns an error immediately at startup rather than letting the program
limp along and panic deep inside DB code later. PORT does have a reasonable
default (":8000"), so a missing value falls back instead of erroring — not
every config value deserves the same strictness. Verified with automated
tests (config_test.go), not just manual checks.

**Connection pool: 4 parameters, set before PingContext**
MaxOpenConns/MaxIdleConns/ConnMaxIdleTime/ConnMaxLifetime are all set before
the first PingContext call, so the very first connection obeys the intended
pool limits rather than Go's defaults. ConnMaxLifetime exists specifically to
force periodic connection recycling — protects against silently-dead
connections (e.g. dropped by a load balancer) that would otherwise surface as
confusing mid-query errors.

**Repository returns domain sentinel errors, not raw Postgres/sql errors**
sql.ErrNoRows is translated to domain.ErrURLNotFound via errors.Is at the
repository boundary (in GetByCode, GetStats). This keeps Postgres-specific
error types out of the service and handler layers entirely — they only ever
see domain errors.

**Deactivate: ownership check inside the SQL statement, not a separate SELECT**
UPDATE ... WHERE short_code = $1 AND user_id = $2 combines the ownership
check and the write into one atomic statement. Doing it as two steps
(SELECT to check owner, then UPDATE) would open a TOCTOU race window and risk
forgetting to re-filter by user_id in the second query.

**GetStats: no ownership filter in SQL — deferred to service layer**
Unlike Deactivate, GetStats is a pure read with no write/race concern, so
ownership validation is left for the service layer to add later (marked with
a TODO) rather than baked into the repository's SQL. Also: GetStats does NOT
filter on is_active, since users should still see stats for URLs they've
deactivated — that's a UX/analytics need, not a security concern like the
redirect hot path.

**Service layer holds domain.URLRepository (interface), not *postgres.URLPostgres**
Preserves the ability to swap Postgres for an in-memory/mock repository
without touching service code. Same reasoning applied to the handler holding
domain.URLService.

**Shorten is an honest stub (returns ErrNotImplemented), not fake logic**
Real short-code generation (Base62 encoding, custom-code validation, and
collision retry against the unique index) doesn't exist yet. Rather than
half-implement it with a hardcoded/empty shortCode (a real bug caught during
review), Shorten explicitly signals "not built yet" until that logic is
written in a later day.

**Redirect increments click count via a detached goroutine + fresh context**
The HTTP request's context gets cancelled once the response is sent back to
the client, so using it for IncrementClicks would risk the click-tracking
update being cancelled mid-flight. A separate context.WithTimeout(context.
Background(), ...) is used instead, so the fire-and-forget update completes
independently of the request lifecycle.

**Known gaps (deliberately deferred, not forgotten):**
- No Base62 short-code generation yet
- No cache layer (Redis) yet — URLCache interface exists, no implementation
- Redirect doesn't yet check ExpiresAt/IsActive at the service layer
- GetStats has no ownership check yet (TODO comment in code)
- Anonymous URLs (user_id = NULL) have no deactivation path — WHERE user_id = $2
  can never match NULL

  ## Day 2 — Short Code Generation (Base62, crypto/rand, collision handling)

**crypto/rand over math/rand**
math/rand is a deterministic PRNG seeded with a predictable value (e.g. time
at process start). Anyone who can approximate that seed can reconstruct the
exact sequence of "random" codes the service will generate — enabling URL
enumeration or pre-registration of future codes. crypto/rand sources entropy
from the OS's CSPRNG (/dev/urandom on Linux), making output computationally
infeasible to predict. Any value exposed to users in a URL must use crypto/rand;
there is no exception for "low stakes" generation.

**7-character codes, escalating to 8 after repeated collisions**
62^7 ≈ 3.5 trillion possible codes. At 100M active URLs, per-insert collision
probability is roughly 1-in-35,000 — rare enough that a single collision on
attempt 1 is expected bad luck, not a signal of a problem. Two consecutive
collisions (attempts 1 and 2) would be astronomically unlikely (~1-in-1.2
billion) if 7 characters were correctly sized for scale — so the retry loop
only escalates codeLen to 8 once attempt > 2, treating repeated failure as a
signal that something abnormal (not just chance) may be happening, rather
than over-provisioning length from the first attempt.

**Insert-and-handle-23505 over check-then-insert**
Checking "does this code exist?" before inserting has a TOCTOU race: two
goroutines can both see "no conflict" in the same tiny window and both
proceed to insert, with one failing anyway. The database's UNIQUE constraint
is the only atomic source of truth for uniqueness — the correct pattern is to
attempt the insert directly, let Postgres enforce the constraint, and react
to failure. Application-level pre-checks add a race window for no benefit.

**Repository translates Postgres 23505 to domain.ErrURLDuplicate**
Using errors.As to unwrap into *pq.Error and check .Code == "23505", the
repository keeps Postgres-specific error types from leaking into the service
layer — the service only ever reasons about domain sentinels. errors.As
(not errors.Is) is required here because the check needs to inspect a field
on the concrete error type, not just compare against a fixed sentinel value.

**Shorten(): validate once, retry up to 5 times, distinct failure sentinel**
validateURL() runs once before the retry loop, not inside it — an invalid
long_url is rejected immediately without wasting a crypto/rand call or a DB
round-trip on doomed attempts. The retry loop itself only retries on
errors.Is(err, ErrURLDuplicate); any other repository error (e.g. dropped
connection) returns immediately, since generating a new code can't fix an
infrastructure failure. Exhausting all 5 attempts returns a new sentinel,
domain.ErrURLShortenFailed, distinct from ErrURLDuplicate — the caller needs
to know "the system gave up" is a different condition from "one attempt
collided."

**Handler status codes: 400 / 503 / 500**
ErrURLInvalid → 400 (client sent bad input, their fault, fixable by them).
ErrURLShortenFailed → 503, not 500 — this isn't a permanent server fault, it's
a transient condition (repeated collision streak) where retrying the exact
same request later would likely succeed, so the client is told to try again
rather than told something is broken. Any unrecognized error → 500 as a
catch-all; the earlier version of this handler had no default branch, which
meant an unexpected error silently returned an implicit 200 with an empty
body — a real bug caught during review, not a hypothetical one.

**Experiment 2.2 — verified, not assumed**
100 concurrent Shorten() calls against a live Postgres instance produced 100
successful inserts with 100 distinct short_codes (SELECT COUNT(DISTINCT
short_code) FROM urls = 100), confirmed race-free under `go run -race`.
Scaling the same test to 1,000,000 concurrent goroutines against a
MaxOpenConns(100) pool caused most goroutines to queue for a connection
rather than fail — a live preview of the pool-exhaustion behavior Day 14's
load testing will measure properly.

**Known gaps (deliberately deferred):**
- CustomCode field exists on CreateURLRequest but has no handling yet —
  Shorten() always generates a random code, custom/vanity code support isn't
  implemented
- No rate limiting yet — Shorten() can be called at unlimited rate per client
- Error responses currently return only a status code, no JSON error body
  describing what went wrong

  ## Day 3 — Endpoints (POST /shorten, GET /:code)

**302 Found over 301 Moved Permanently**
301 Moved Permanently instructs browser clients to cache the redirection target permanently on the client side. Subsequent visits by the same user bypass the shortener backend entirely, which breaks click-count analytics (the server never receives the request) and prevents immediate URL deactivation or expiration enforcement. 302 Found guarantees every click hits the backend server, ensuring accurate analytics and real-time link control at the cost of one additional round-trip per redirect.

**Payload body safety with http.MaxBytesReader**
All POST handlers wrap request bodies with `http.MaxBytesReader(w, r.Body, 1<<20)` (1 MB limit). Unbounded body reads create a Denial-of-Service (DoS) vulnerability where malicious callers send multi-gigabyte payloads to exhaust server memory and trigger OOM killer process termination.

**Fire-and-forget click tracking with decoupled context**
Click count increments in `service.Redirect()` are dispatched asynchronously in a goroutine to avoid adding database write latency to the HTTP redirect hot path. The goroutine uses `context.Background()` with a 3-second timeout rather than the HTTP request context `r.Context()`. The HTTP request context is canceled immediately when the handler returns the response; passing `r.Context()` to a background goroutine causes mid-flight database queries to be canceled silently.

**HTTP status code semantic mapping**
Creation returns `201 Created` with a `Location` header pointing to the generated short URL and a JSON body containing `short_url` and `short_code`. Input validation failures distinguish syntactic/structural JSON errors (`400 Bad Request`) from domain validation failures such as invalid URL scheme (`422 Unprocessable Entity`). Link redirection distinguishes non-existent/deactivated links (`404 Not Found`) from expired links (`410 Gone`).

**Decoupled BaseURL in configuration**
Configuration loads `BaseURL` (defaulting to `http://localhost:8000`) independently of internal bind `PORT`. Internal bind ports (`:8000`) do not necessarily match public-facing domain URLs behind reverse proxies or load balancers (e.g. `https://short.ly`).

**Known gaps (deliberately deferred):**
- All redirects query PostgreSQL directly; Redis caching layer is not yet implemented (Day 7-8)
- No per-client or per-IP rate limiting on shortener endpoints (Day 9)
- Async click count writes directly to PostgreSQL per redirect; no click batching or async buffer queue

## Day 4 — JWT Auth Middleware + DELETE /:code

**Stateless JWT verification over stateful sessions**
JWT (JSON Web Token) authentication is used to verify user identity statelessly. By digitally signing claims (`user_id`, `exp`, `iat`) with an HMAC-SHA256 secret key (`JWT_SECRET`), the server verifies token integrity on every request in memory without querying PostgreSQL or Redis for active session lookups. This prevents database CPU and memory saturation under high request concurrency.

**Type-safe context keys with custom type definition**
Go's `context.WithValue` accepts `any` (`interface{}`) as key, which risks key collision if third-party packages or other middleware use raw strings like `"userID"`. Defining a private type `type contextKey string` and constant `const contextKeyUserID contextKey = "userID"` ensures that Go's type-assertion and equality checks match on `(Type: handler.contextKey, Value: "userID")`, rendering it impossible for third-party libraries to overwrite or read authenticated user context.

**IDOR prevention: returning 404 Not Found instead of 403 Forbidden**
When a user attempts to delete a URL they do not own (or a URL that does not exist), `repository.Deactivate` uses `UPDATE urls SET is_active = false WHERE short_code = $1 AND user_id = $2`. If `RowsAffected()` returns 0, the repository returns `domain.ErrURLNotFound`, and the handler returns `404 Not Found`. Returning `403 Forbidden` would leak resource existence to an attacker, enabling short-code enumeration across the platform.

**Atomic SQL ownership enforcement**
Combining URL existence check, status check, and ownership verification into a single atomic `UPDATE` query eliminates TOCTOU (Time-of-Check to Time-of-Use) race conditions and cuts database round-trips from two (`SELECT` then `UPDATE`) down to one.

**Middleware chaining: AuthMiddleware vs RequireAuth**
`AuthMiddleware` runs first on every route to inspect the optional `Authorization: Bearer <token>` header, verify HMAC signatures, and inject `userID` into context. `RequireAuth` acts as a downstream gatekeeper for protected endpoints (like `DELETE /{code}`), performing a fast 2-line check (`if userID == nil`) to return `401 Unauthorized` without redundant signature re-parsing.

**Explicit context-to-struct binding in handlers**
`AuthMiddleware` attaches `userID` to `r.Context()`, but handlers must explicitly extract it via `userIDFromContext(r.Context())` and bind it to domain request structs (`req.UserID`). Failing to populate `req.UserID` causes URLs to be created with `user_id = NULL`, which subsequently breaks ownership-based deletion queries—a critical integration checkpoint caught during Day 4 verification.

**Known gaps (deliberately deferred):**
- Token revocation / blocklist layer is not yet implemented (tokens remain valid until `exp`)
- Refresh token rotation is not yet implemented

## Day 5 — GET /stats/:code Analytics Endpoint

**403 Forbidden vs 404 Not Found for read-only vs destructive authorization**
While `DELETE /{code}` returns `404 Not Found` for both non-existent links and unauthorized users to prevent resource existence enumeration (IDOR protection for destructive actions), `GET /stats/{code}` returns `403 Forbidden` for non-owners. For read-only analytics, confirming link existence to an authenticated user presents negligible risk while providing clear feedback for legitimate multi-account workflows or management tools.

**Service-layer authorization with explicit nil-pointer guarding**
The repository query (`SELECT ... FROM urls WHERE short_code = $1`) intentionally omits `is_active = true` and `user_id` filters so historical analytics remain retrievable for soft-deleted URLs. Ownership verification is performed in the service layer using explicit nil-pointer guards (`if url.UserID == nil || *url.UserID != userID`). Comparing primitive values (`*url.UserID != userID`) rather than pointer addresses (`url.UserID != &userID`) avoids false authorization rejections caused by stack pointer allocations.

**Historical analytics accessibility for soft-deleted URLs**
Deactivating a short URL (`is_active = false`) removes it from the redirection hot path (`GET /{code}` returns `404`) but preserves its row in PostgreSQL. `GET /stats/{code}` returns `200 OK` with `"is_active": false` and total accumulated `click_count`, enabling link creators to inspect historical performance data post-deactivation.

**Known gaps (deliberately deferred):**
- Click count metrics are scalar atomic counts without time-series breakdown (e.g. clicks by hour/day, referrer, or geo-location)
- No caching layer for stats queries (every stats request hits PostgreSQL directly; to be addressed if analytics traffic scales)
- Redis cache invalidation on link deactivation deferred to Day 8

## Day 6 — Week 1 Hardening & Security Audit

**Defense-in-depth security checklist**
Enforced multi-layered security verification across all HTTP handlers and repository operations:
1. `http.MaxBytesReader(w, r.Body, 1<<20)` wraps all POST request bodies to enforce a 1 MB size ceiling, mitigating memory exhaustion Denial-of-Service (DoS) attacks.
2. Mandatory Context propagation (`QueryRowContext`, `ExecContext`) across all PostgreSQL queries ensures client connection cancellations or request timeouts immediately abort pending database operations.
3. Domain URL validation rejects non-HTTP/HTTPS schemes (e.g. `javascript:`, `data:`, `file:`) to prevent Stored XSS and open redirect vulnerabilities.
4. User identity (`userID`) is extracted exclusively from validated JWT claims in request context, preventing body-injection impersonation.

**Systematic error wrapping with `fmt.Errorf("%w")`**
All PostgreSQL infrastructure errors are wrapped at the repository layer using `fmt.Errorf("postgres <method>: %w", err)`. The `%w` verb preserves the error unwrap chain for `errors.Is`/`errors.As` inspection (allowing domain sentinel matching such as `sql.ErrNoRows` -> `domain.ErrURLNotFound`), while supplying precise operational context in application logs.

**Stateless concurrency and data race verification**
Audited the application under `go run -race` during concurrent load testing. Zero data races were detected. The Go application layer maintains zero in-memory mutable state (no shared global maps, slices, or unprotected structs); all state updates occur atomically within PostgreSQL queries (`UPDATE urls SET click_count = click_count + 1`).

**Known gaps (deliberately deferred):**
- Redis caching layer for redirection hot path deferred to Day 7–8
- Per-IP / per-user rate limiting middleware deferred to Day 9
- Cache stampede prevention via `singleflight` deferred to Day 10
- Structured logging with `slog` and trace ID propagation deferred to Day 12

## Day 7 — Redis Setup, Connection Pool & URLCache Abstraction Layer

**Redis as an optional performance layer vs PostgreSQL as source of truth**
PostgreSQL is the durable source of truth on disk. Redis is an optional, volatile cache in RAM (~0.1ms reads vs ~2ms DB queries). If Redis goes down or fails at startup, `NewRedisURLCache` returns a warning log instead of panicking with `log.Fatalf`. The service degrades gracefully by falling back to PostgreSQL for all reads without surfacing HTTP 500 errors to users.

**Connection pool tuning (`PoolSize=10`, `MinIdleConns=2`, `ConnMaxIdleTime=5m`)**
Reusing open TCP connections from a pool avoids adding 1–3ms TCP handshake latency to every HTTP request. `MinIdleConns=2` keeps 2 idle connections pre-warmed for instant execution, while `PoolSize=10` prevents socket exhaustion. `ConnMaxIdleTime=5m` recycles stale connections.

**Control flow mapping: `redis.Nil` to `domain.ErrCacheMiss`**
`go-redis` returns `redis.Nil` when a key does not exist or has expired. This is an expected cache miss (normal control flow), not an infrastructure failure. `Get()` explicitly maps `redis.Nil` to `domain.ErrCacheMiss` using `errors.Is`. Infrastructure errors (connection timeouts/refusals) are wrapped with `fmt.Errorf("cache get: %w", err)` so loggers can track Redis outages.

**Key namespace prefixing (`"url:"`)**
Keys are stored in Redis with the `"url:"` prefix (e.g. `"url:aB3x9K1"`). Because Redis is a flat global key-value store, prefixing isolates the URL cache namespace from future Redis features (e.g., rate limiting keys like `"ratelimit:192.168.1.1"`), preventing key collisions.

**Eviction policy (`allkeys-lru`)**
Configuring Redis with `allkeys-lru` ensures that when memory is full, the least recently used keys are automatically evicted. This preserves hot URLs in RAM and prevents Redis from returning OOM write errors.

**Known gaps (deliberately deferred):**
- Cache-Aside lookup logic in `Redirect()` and cache populating deferred to Day 8
- Cache invalidation (`Delete`) on link deactivation deferred to Day 8
- Redis Lua script rate limiting middleware deferred to Day 9

## Day 8 — Cache-Aside Pattern in Redirect Hot Path

**Cache-Aside Read Flow (`service.Redirect`)**
`Redirect()` checks the Redis cache first via `cache.Get(ctx, code)`. On a cache hit (`err == nil`), the long URL is returned immediately (~0.8ms), and click count is incremented asynchronously in a detached goroutine. On a cache miss (`domain.ErrCacheMiss`) or infrastructure error (e.g. Redis timeout/outage), the service falls back to PostgreSQL. On DB hit, a background goroutine with `context.Background()` asynchronously populates Redis (`cache.Set`) and increments clicks without blocking response latency.

**DB-First Invalidation Order (`service.Delete`)**
URL deactivation updates PostgreSQL first (`repo.Deactivate`). Only after the DB write succeeds is the cache key invalidated via `cache.Delete`. PostgreSQL remains the atomic source of truth; if cache deletion fails, the stale entry expires on its TTL, whereas invalidating cache before a failed DB write would cause cache repopulation and data inconsistency.

**Dynamic TTL Calculation (`determineTTL`)**
Default cache TTL is 1 hour. For URLs with an explicit `ExpiresAt` timestamp, TTL is dynamically calculated as `time.Until(*ExpiresAt)`, capped at 1 hour. If a URL is already expired (`ttl <= 0`), `determineTTL` returns `1s` rather than `0` (which in `go-redis` indicates no expiration/persist forever).

**Graceful Degradation under Infrastructure Failures**
Cache read and write failures are caught, logged at `[WARN]` level, and handled silently without bubbling up to the client. A total Redis failure degrades system latency (falling back to ~2ms DB queries) but returns `302 Found` with zero 500 Internal Server Errors.

**Known gaps (deliberately deferred):**
- Sliding-window rate limiting middleware implemented in Day 9
- Cache stampede prevention on cold key spikes via `singleflight` deferred to Day 10

## Day 9 — Rate Limiting Middleware (Sliding Window with Redis Lua Script)

**Sliding Window Algorithm over Fixed Window**
Fixed-window rate limiting resets request counters at hard time boundaries (e.g. `:00` seconds), opening a boundary burst vulnerability where a client can send N requests at `:59` and another N requests at `:00` (allowing 2N requests in 2 seconds). Sliding window counts requests over a rolling window (`now - 60s`) from the current moment, eliminating boundary bursts.

**Redis Sorted Sets (ZSET) Data Structure**
Each client IP maps to a Redis Sorted Set key (`"rate:<ip>"`). Request timestamps (nanoseconds) serve as both the ZSET score and value (appended with a random float to ensure member uniqueness for concurrent requests). Older timestamps (`< now - window`) are pruned using `ZREMRANGEBYSCORE`, and current request counts are evaluated using `ZCARD`.

**Atomic Execution via Redis Lua Script**
Executing `ZREMRANGEBYSCORE`, `ZCARD`, and `ZADD` as separate Redis commands over Go opens a Time-of-Check to Time-of-Use (TOCTOU) race condition: under concurrency, multiple goroutines read `ZCARD` simultaneously before any execute `ZADD`, allowing burst traffic above the limit. Wrapping the operations inside a single Redis Lua script (`slidingWindowScript.Run`) guarantees atomic execution on Redis's single-threaded event loop.

**Lua 5.1 Explicit Type Coercion (`tonumber`)**
Redis Lua 5.1 automatically coerces string arguments (`ARGV`) for arithmetic operations (`-`, `+`), but throws a runtime error when evaluating relational operators (`>=`) between integers (`ZCARD` output) and string arguments. All `ARGV` parameters are explicitly wrapped in `tonumber(ARGV[i])` to prevent script execution failures.

**Fail-Open Resilience Policy**
If Redis is down or returns a script error, `RateLimitMiddleware` catches the error, logs/ignores it, and calls `next.ServeHTTP(w, r)` (failing open). Rate limiting protects infrastructure against abuse but must never cause a total service outage during a cache/Redis maintenance window.

**IP Resolution & Header Protocol**
Client IP is extracted via `realIP(r)`, checking `X-Forwarded-For` first (for reverse proxy/load balancer compatibility) with fallback to `net.SplitHostPort(r.RemoteAddr)`. When rate limited, the server responds with `429 Too Many Requests`, sets `Retry-After: 60`, and returns JSON `{"error":"rate limit exceeded"}`.

**Known gaps (deliberately deferred):**
- Rate limiting is per-IP only; per-authenticated-user or per-API-key rate limiting tiers are not implemented

## Day 10 — Cache Stampede Prevention with singleflight

**Cache Stampede (Thundering Herd) Vulnerability**
When a popular short code's cache entry expires or is flushed, concurrent requests for that key all experience a Redis cache miss simultaneously. Without in-process coalescing, all concurrent requests hit PostgreSQL with identical `SELECT` queries (`GetByCode`) before the first request can complete and populate Redis. In load testing, 50 concurrent requests produced 50 distinct database queries for 1 single URL lookup.

**In-Process Coalescing via `singleflight.Group`**
`singleflight.Group` (`golang.org/x/sync/singleflight`) coalesces concurrent in-flight requests for the same key. When multiple goroutines invoke `s.sf.Do(code, fn)` simultaneously with the same short code, only the first goroutine executes `fn` (the database fetch and cache write). All other goroutines block and share the exact same returned values when `fn` completes. Under load testing (`hey -n 50 -c 50`), 50 concurrent requests resulted in **exactly 1 PostgreSQL query**.

**Cache Read Order: Cache-First before `sf.Do()`**
The initial Redis `cache.Get` check remains **outside and before** `sf.Do()`. Cache hits execute in ~0.8ms without touching singleflight locks or channels. `singleflight` is applied only on a cache miss to deduplicate expensive database reads.

**Synchronous Cache Population Inside `sf.Do()`**
`s.cache.Set` is executed **synchronously** inside `sf.Do()` before `sf.Do()` returns. If cache population were asynchronous (launched in a background goroutine), `sf.Do()` would return and unblock waiting goroutines before Redis was populated, allowing subsequent requests arriving a fraction of a millisecond later to miss Redis and trigger a second database query.

**Decoupled Async Analytics Outside `sf.Do()`**
`IncrementClicks` is executed in an asynchronous background goroutine **outside `sf.Do()`** after `sf.Do()` completes successfully. Because `sf.Do()` executes its function body only once for coalesced callers, putting click tracking inside `sf.Do()` would drop click analytics for all waiting requests. Executing `IncrementClicks` per caller outside `sf.Do()` ensured click count in PostgreSQL increased by exactly 50 (from 51 to 101) during 50 concurrent requests.

**Known gaps (deliberately deferred):**
- Singleflight coalesces concurrent requests within a single application instance (in-process). Distributing singleflight across multiple server instances (distributed locking / Redis mutex) is not implemented.

## Day 11 — Week 2 Hardening (Redis Failure Audit, Context Timeouts, and Edge Cases)

**Redis Failure Resilience & Fallback Strategy**
PostgreSQL is the single atomic source of truth; Redis is an ephemeral read-side optimization. On read operations (`cache.Get`), Redis failures other than `domain.ErrCacheMiss` are logged as `[WARN]` and allowed to fall through to PostgreSQL. The service maintains 100% request availability at slightly higher database latency (~2ms vs ~0.8ms). On write operations (`cache.Set`, `cache.Delete`), Redis failures are caught, logged at `[WARN]`, and ignored, returning success to the client because the primary database operation succeeded.

**Context Timeout Hardening & Client Disconnect Isolation**
All background cache and click-tracking goroutines (`cache.Set`, `cache.Delete`, `IncrementClicks`) use a decoupled `context.Background()` with a strict 3-second timeout (`context.WithTimeout`). Passing derived HTTP request contexts (`r.Context()`) to background goroutines opens a race condition: if an HTTP client disconnects mid-request, the parent context cancels, causing background operations like `cache.Set` inside `singleflight.Do` to fail prematurely. Utilizing `context.Background()` guarantees cache population completes for waiting goroutines regardless of client connection state.

**TTL Edge Case Boundaries & Expiry Synchronization**
`determineTTL` calculates cache expiration as `min(time.Until(ExpiresAt), 1 hour)`. For URLs expiring within seconds, Redis TTL is constrained to the exact remaining life of the link. If a URL is already expired (`ttl <= 0`), `determineTTL` falls back to `1s` rather than `0` (which `go-redis` interprets as no expiration/persist forever). This guarantees Redis automatically evicts expired keys, preventing stale cache hits from serving expired links past their `expires_at` timestamp.

**DB-First Invalidation Order**
URL deletion deactivates PostgreSQL first (`is_active = false`) before deleting the Redis key (`cache.Delete`). Executing cache deletion prior to DB write risks a race condition where a concurrent request repopulates Redis with live data if the DB update fails or takes longer than expected. DB-first invalidation ensures PostgreSQL remains consistent as the authoritative source of truth.

378: **Known gaps (deliberately deferred):**
379: - Structured logging with slog deferred to Day 12
380: - Graceful shutdown and multi-stage Docker build deferred to Day 13
381: 
382: ## Day 12 — Structured Logging with slog and Request IDs
383: 
384: **Structured JSON Logging (`slog.JSONHandler`)**
385: Replaced unstructured text logs (`fmt.Printf`/`log.Printf`) with Go standard library `log/slog` structured JSON events (`slog.NewJSONHandler`). Emitting structured key-value events to `os.Stdout` enables log aggregators (Datadog, Grafana Loki, CloudWatch) to automatically index numeric metrics (`status`, `latency_ms`) and categorical metadata (`method`, `path`, `ip`) without brittle regex parsing.
386: 
387: **Distributed Tracing & Request ID Protocol (`X-Request-ID`)**
388: `LoggingMiddleware` inspects incoming HTTP requests for an existing `X-Request-ID` header (reusing upstream identifiers from reverse proxies like Cloudflare or Nginx). If missing, a nanosecond-timestamp string ID (`strconv.FormatInt(time.Now().UnixNano(), 10)`) is generated. The `X-Request-ID` header is written to response headers prior to executing downstream handlers (`next.ServeHTTP`) to guarantee header delivery before response body or status code flushing occurs.
389: 
390: **Decoupled Context Logger (`internal/ctxlog`)**
391: Context-logging helpers (`WithLogger` and `GetLogger`) are isolated inside `internal/ctxlog` rather than `internal/handler`. This preserves Clean Architecture dependency boundaries: services (`internal/service`) and database repositories (`internal/repository/postgres`) extract request-scoped loggers from `context.Context` without creating an architectural dependency on HTTP handler transport code.
392: 
393: **Response Status Interception (`responseWriter` Wrapper)**
394: Standard Go `http.ResponseWriter` does not expose an accessor for the HTTP status code written by downstream handlers. `responseWriter` embeds `http.ResponseWriter` anonymously to intercept `WriteHeader(code int)` and record `rw.statusCode` (defaulting to `200 OK`). After `next.ServeHTTP` completes, the middleware emits a single `INFO` log line containing `method`, `path`, `status`, `latency_ms`, `ip`, and the inherited `request_id`.
395: 
396: **Known gaps (deliberately deferred):**
397: - W3C Trace Context (`traceparent` header) and OpenTelemetry distributed tracing across external microservice boundaries deferred to future scope.
398: - Graceful shutdown and multi-stage Docker build deferred to Day 13.
399: 
400: ## Day 13 — Graceful Shutdown & Multi-Stage Docker Build
401: 
402: **3-Phase Graceful Shutdown Sequence**
403: `cmd/server/main.go` intercepts `SIGINT` (Ctrl+C) and `SIGTERM` (Docker/Kubernetes termination) using a buffered signal channel (`make(chan os.Signal, 1)`). Shutdown follows a strict 3-phase sequence: (1) `srv.Shutdown(ctx)` immediately stops accepting new incoming connections, (2) in-flight HTTP handler goroutines are given up to 30 seconds (`context.WithTimeout`) to complete writing responses, and (3) `db.Close()` releases database connection pool resources. Closing DB connections prior to draining in-flight requests would cause active queries to fail mid-flight with `sql: database is closed`.
404: 
405: **`http.ErrServerClosed` Filtering**
406: When `srv.Shutdown()` is invoked, `srv.ListenAndServe()` unblocks and returns `http.ErrServerClosed`. `main.go` explicitly filters this sentinel error (`!errors.Is(err, http.ErrServerClosed)`) to prevent intentional graceful shutdowns from logging false-positive error alerts in monitoring platforms.
407: 
408: **Multi-Stage Docker Build (`golang:alpine` -> `scratch`)**
409: The application container uses a two-stage build architecture. Stage 1 (`golang:alpine` as `builder`) compiles a static Linux binary (`CGO_ENABLED=0`) with symbol stripping (`-ldflags="-w -s"`). Stage 2 (`scratch`) starts from an empty 0-byte image and copies only the compiled binary and system TLS root certificates (`ca-certificates.crt`). Throwing away the compiler toolchain, package managers, and source code reduces the final Docker image size from **604MB to 12MB** (98% reduction) and eliminates the container attack surface (zero `/bin/sh` shell or OS utilities available).
410: 
411: **Full-Stack Docker Compose Orchestration & Health Checks**
412: `docker-compose.yml` orchestrates PostgreSQL 15, Redis 7, and the application container on an isolated bridge network. To resolve the database startup race condition (where Go boots in ~5ms while Postgres takes ~3s to initialize disk files), the Postgres service defines an explicit healthcheck (`pg_isready -U appuser -d urlshortener`). The application service enforces `depends_on: postgres: condition: service_healthy`, holding app startup until Postgres is 100% ready to receive queries. Schema migrations are auto-executed on initial boot via volume mount `./migrations:/docker-entrypoint-initdb.d`.
413: 
414: **Known gaps (deliberately deferred):**
415: - Load testing, latency measurements under concurrency (p50/p99), and bottleneck analysis deferred to Day 14.

## Day 14 — Load Testing with hey (p50/p99 Latency & Bottleneck Analysis)

**Performance Benchmark Baselines**
Load testing was executed using `hey` under 100 concurrent workers (`-c 100`) to measure throughput and tail latency across warm-cache read, cold-cache read, and write paths. Measured results:

| Benchmark Scenario | Requests | Throughput (RPS) | p50 Latency | p99 Latency | Status Code Distribution |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Warm Cache Baseline** (`GET /:code`) | 5,000 | 14,995 req/sec | 5.2 ms | 26.2 ms | `[302]` 5000 (100%) |
| **Cold Cache Baseline** (`GET /:code`) | 5,000 | 15,003 req/sec | 5.2 ms | 25.3 ms | `[302]` 5000 (100%) |
| **Write Path** (`POST /shorten`) | 1,000 | 15,634 req/sec | 2.3 ms | 12.5 ms | `[201]` 10 (1%), `[429]` 990 (99%) |

**Singleflight Stamps out Cold-Cache DB Thundering Herds**
Flushing Redis (`redis-cli FLUSHALL`) prior to firing 5,000 concurrent requests resulted in identical p50/p99 latency (5.2ms / 25.3ms) to the warm cache baseline. `singleflight.Group` coalesced all 100 concurrent initial requests into exactly 1 PostgreSQL query, synchronously populating Redis before releasing waiting goroutines. Subsequent requests were immediately served from warm cache without exhausting database connection pool limits.

**Write-Path Throttling Resilience (`POST /shorten`)**
Under a burst of 1,000 POST requests, `RateLimitMiddleware` (backed by Redis sliding-window Lua script) strictly enforced the 10 req/min limit per client IP. Exactly 10 requests returned `201 Created` while 990 requests were rejected in 0.06 seconds with `429 Too Many Requests` (p50: 2.3ms). This verified system resilience against write-path spam without crashing database connection pools.

**Known gaps (deliberately deferred):**
- Horizontal load balancing across multiple application instances (Nginx / HAProxy / AWS ALB) deferred to future production deployment.