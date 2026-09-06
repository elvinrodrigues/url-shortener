# URL Shortener — Architecture & Design Document

## 1. System Overview

The URL Shortener is a high-throughput, low-latency URL shortening and redirection service built in Go, PostgreSQL, and Redis. It is designed to handle read-heavy traffic (100:1 read/write ratio) with a target latency of sub-5ms for warm cache redirects while maintaining strict data integrity, atomic concurrency, and graceful degradation during infrastructure outages.

### Request Flow Topology

```text
                                 ┌─────────────────────────────────┐
                                 │       HTTP Clients / Load       │
                                 └────────────────┬────────────────┘
                                                  │
                                                  ▼
                                 ┌─────────────────────────────────┐
                                 │   Logging & Rate Limit (Lua)    │
                                 └────────┬───────────────┬────────┘
                                          │               │
                      ┌───────────────────┘               └───────────────────┐
                      │                                                       │
                      ▼                                                       ▼
        ┌──────────────────────────┐                             ┌──────────────────────────┐
        │  Read Path: GET /:code   │                             │ Write Path: POST /shorten│
        └─────────────┬────────────┘                             └────────────┬─────────────┘
                      │                                                       │
                      ▼                                                       ▼
        ┌──────────────────────────┐                             ┌──────────────────────────┐
        │    Redis URLCache.Get    │                             │ Crypto Base62 Generator  │
        └───────┬──────────┬───────┘                             └────────────┬─────────────┘
                │          │                                                  │
       Cache    │          │ Cache Miss /                                     ▼
        Hit     │          │ Outage                               ┌──────────────────────────┐
 (~0.8ms)       │          │                                      │ PostgreSQL Repository    │
                ▼          ▼                                      │ (Atomic INSERT 23505)    │
        ┌─────────────┐  ┌──────────────────────────┐             └───────────┬──────────────┘
        │ 302 Found   │  │ Singleflight Coalescing  │                         │
        │ Response    │  └────────────┬─────────────┘                         ▼
        └─────────────┘               │                            ┌──────────────────────────┐
                                      ▼                            │ HTTP 201 Created        │
                         ┌──────────────────────────┐              └──────────────────────────┘
                         │ PostgreSQL IndexScan     │
                         └────────────┬─────────────┘
                                      │
                                      ▼
                         ┌──────────────────────────┐
                         │ Populates Redis Cache    │
                         │ (Detached Background)    │
                         └──────────────────────────┘
```

---

## 2. Design Goals

1. **Sub-5ms p50 Tail Latency**: Serve the redirect hot path (`GET /:code`) from RAM via Redis with minimum overhead.
2. **High Concurrency & Singleflight Coalescing**: Prevent DB connection exhaustion during cache misses using `singleflight` in-process deduplication.
3. **Graceful Degradation**: Continue serving redirects from PostgreSQL if Redis experiences downtime or network partitions (fail-open architecture scoped to the redirect read path; write-path rate limiting defaults to fail-closed, see §5.4).
4. **Data Integrity & Attack Prevention**: Prevent URL enumeration via CSPRNG short-code generation, enforce payload limits (`http.MaxBytesReader`), and isolate tenant operations atomically in SQL.

---

## 3. Data Model

### `urls` Table Schema

| Column | Type | Constraints / Defaults | Reasoning |
| :--- | :--- | :--- | :--- |
| `id` | `BIGSERIAL` | `PRIMARY KEY` | 64-bit auto-incrementing identifier. Avoids 32-bit `SERIAL` overflow (~2.1B ceiling) at scale. |
| `short_code` | `VARCHAR(30)` | `NOT NULL` | 7-character Base62 code with headroom for custom/vanity strings. Uniqueness enforced via partial index. |
| `long_url` | `TEXT` | `NOT NULL` | Destination URL. Uses `TEXT` to accommodate arbitrary RFC-compliant URL lengths. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` | Stores UTC timestamps normalized across app servers and database timezone settings. |
| `expires_at` | `TIMESTAMPTZ` | `NULL` | Optional link expiration. Nullable for permanent links. |
| `is_active` | `BOOLEAN` | `NOT NULL, DEFAULT true` | Soft-delete flag. Preserves audit history without hard-deleting database records. |
| `click_count` | `BIGINT` | `NOT NULL, DEFAULT 0` | Cumulative click counter. Updated asynchronously in detached background operations. |
| `user_id` | `BIGINT` | `NULL` | Tenant/owner identifier extracted from JWT claims. Nullable for anonymous URLs. |

### Partial Index Strategy

```sql
-- 1. Redirect Hot Path Index (Covering & Partial)
CREATE UNIQUE INDEX idx_urls_short_code 
ON urls (short_code) 
INCLUDE (long_url, expires_at, is_active) 
WHERE is_active = true;

-- 2. User Dashboard Query Index
CREATE INDEX idx_urls_user_created 
ON urls (user_id, created_at DESC) 
WHERE is_active = true;

-- 3. Background Expiry Cleanup Index
CREATE INDEX idx_urls_expires_at 
ON urls (expires_at) 
WHERE expires_at IS NOT NULL AND is_active = true;
```

**Index Design Rationales**:
- `idx_urls_short_code`: `INCLUDE (long_url, expires_at, is_active)` enables **Index-Only Scans** in PostgreSQL. The database retrieves destination details directly from the B-Tree index pages without visiting the main table heap. The `WHERE is_active = true` clause keeps index footprint minimal and allows soft-deleted short codes to be re-assigned if needed.
- `idx_urls_user_created`: B-Tree index optimized for `ORDER BY created_at DESC` pagination on user management dashboards.
- `idx_urls_expires_at`: Filters out non-expiring links (`expires_at IS NULL`), minimizing maintenance overhead during background link cleanup worker runs.

---

## 4. API Design & HTTP Status Code Mapping

### `POST /shorten`
Creates a shortened URL mapping.
- `201 Created`: Successfully generated. Returns JSON response with `short_url` and `short_code` alongside a `Location` header.
- `400 Bad Request`: Malformed JSON syntax or empty body.
- `422 Unprocessable Entity`: Invalid URL structure or unsupported scheme (e.g. non-http/https).
- `409 Conflict`: Custom code already in use.
- `429 Too Many Requests`: Client IP exceeded sliding-window rate limit.
- `503 Service Unavailable`: Code generation collision retry budget exhausted (5 attempts).

### `GET /:code`
Redirects short code to destination.
- `302 Found`: Temporary redirect. Forces client browsers to re-verify every click against the backend.
- `404 Not Found`: Short code does not exist or has been soft-deleted (`is_active = false`).
- `410 Gone`: Short code has exceeded its `expires_at` timestamp.

### `DELETE /:code` (Protected by JWT)
Deactivates a short URL.
- `204 No Content`: Successfully deactivated (`is_active = false`).
- `401 Unauthorized`: Missing or invalid Bearer token.
- `404 Not Found`: Link does not exist OR belongs to another user (**IDOR prevention**).

### `GET /stats/:code` (Protected by JWT)
Retrieves analytics for a short code.
- `200 OK`: Returns click count, creation timestamp, and status (accessible even if `is_active = false`).
- `401 Unauthorized`: Missing or invalid Bearer token.
- `403 Forbidden`: Authenticated user is not the owner of the specified URL.

---

## 5. Architectural Decisions & Tradeoff Analysis

### 5.1 Short Code Generation: Random Base62 vs. UUID vs. Sequential
- **Alternatives Considered**: 
  1. *Sequential Integer ID*: Convert auto-incrementing DB ID to Base62 (`1` -> `a`, `2` -> `b`). Vulnerable to enumeration attacks (competitors can scrape all URLs sequentially).
  2. *UUIDv4*: 36-character string. Oversized for a URL shortener; defeats the purpose of "short" URLs.
- **Chosen Design**: Random 7-character Base62 string generated via CSPRNG (`crypto/rand`).
- **Collision Math**: $62^7 \approx 3.52 \times 10^{12}$ (3.5 Trillion) combinations. At 100M active URLs, per-insert collision probability is $\sim 1 \text{ in } 35,000$.
- **Retry Strategy**: 5-attempt retry loop in the application layer. The repository attempts an atomic `INSERT`. If Postgres returns error code `23505` (`unique_violation`), the service catches `domain.ErrURLDuplicate` and retries with a new code. If attempts $> 2$, length escalates to 8 characters.

### 5.2 Redirect Status Code: 302 Found vs. 301 Moved Permanently
- **Chosen Design**: `302 Found` (Temporary Redirect).
- **Tradeoff Justification**:
  1. *Click Analytics*: `301` causes browsers to cache the target locally indefinitely. Subsequent clicks bypass the backend entirely, breaking analytics.
  2. *Immediate Deactivation*: If a link is deleted (`is_active = false`) or flagged for malware, a `301` cached in the user's browser continues redirecting to the destination.
  3. *Short Code Reuse*: Recycled codes would serve stale destinations to users with cached `301` responses.

### 5.3 Caching Pattern: Cache-Aside with Dynamic TTL
- **Chosen Design**: Cache-Aside (Lazy Loading).
- **Read Flow**: Check Redis `url:<code` -> Hit: return `long_url`. Miss: fetch from Postgres, write to Redis asynchronously, return `long_url`.
- **Write/Delete Invalidation**: Database-First Invalidation Order. `UPDATE urls SET is_active = false` executes on Postgres first. On success, `cache.Delete` invalidates Redis. If cache invalidation fails, stale data expires via TTL.
- **Dynamic TTL**: Default TTL is 1 hour. For links with `expires_at`, TTL is calculated as `min(time.Until(expires_at), 1h)`. Expired links (`TTL <= 0`) are assigned `1s` TTL to ensure rapid eviction without persisting indefinitely.

### 5.4 Rate Limiting: Redis Lua Sliding Window
- **Problem with Fixed Window**: Clients can send limit $N$ requests at `:59` and $N$ requests at `:00`, allowing $2N$ requests in a 2-second burst window.
- **Chosen Algorithm**: Sliding Window using Redis Sorted Sets (`ZSET`).
- **Lua Script Atomicity**: `ZREMRANGEBYSCORE` (prune old entries), `ZCARD` (count current window), and `ZADD` (add current request timestamp) are bundled into a single Redis Lua script. This eliminates Time-of-Check to Time-of-Use (TOCTOU) race conditions under concurrent requests.
- **Fail-Closed Default Policy**: If Redis is unreachable, `RateLimitMiddleware` logs the error with the key and returns `503 Service Unavailable` with a `Retry-After` header. This fails closed on the write path (`POST /shorten`) to prevent unbounded link creation during an outage. An optional `RATE_LIMIT_FAIL_OPEN=true` configuration allows operators to fail open if availability is prioritized over abuse protection.
- **Client Attribution**: `X-Forwarded-For` is client-supplied and therefore forgeable, so honouring it unconditionally would let any caller reset its own bucket by rotating the header. `IPResolver` only consults the header when the immediate peer falls inside a trusted-proxy CIDR set (`TRUSTED_PROXIES`, defaulting to loopback and the RFC1918/RFC4193 ranges), then walks the chain right-to-left and takes the first untrusted hop. Untrusted peers are attributed to their socket address. Set `TRUSTED_PROXIES=*` only when the platform's edge proxy connects from a public address and the service is unreachable except through it.

### 5.5 Cache Stampede Prevention: In-Process `singleflight`
- **Vulnerability**: When a hot key expires in Redis, thousands of concurrent requests miss the cache simultaneously and hit PostgreSQL with identical `SELECT` queries (Thundering Herd).
- **Chosen Design**: `golang.org/x/sync/singleflight`.
- **Mechanism**: The first request triggers `sf.Do(code, fn)` to execute the database query and populate Redis synchronously. Subsequent concurrent requests for the same code block and share the result of the initial call.
- **Verification**: `TestRedirect_SingleflightCoalescesConcurrentMisses` drives 100 concurrent `Redirect` calls for one uncached code against a repository double holding an atomic call counter, and asserts the counter is **exactly 1**. The throughput benefit is measured separately in §6.
- **Follower Isolation**: The shared database read runs under `context.WithoutCancel(ctx)`. Because singleflight hands the leader's result to every follower, binding the read to the leader's request context would let one client disconnect fail every request coalesced behind it. `TestRedirect_LeaderCancellationDoesNotAbortSharedRead` cancels the leader mid-read and asserts both that the shared read still observes a live context and that the result is returned intact.
- **Negative Caching**: A cache miss that resolves to `ErrURLNotFound` stores a sentinel under a 60-second TTL, so repeated probes for a nonexistent code cost one database read rather than one per request. Creating a link evicts any sentinel for its code synchronously, so a freshly claimed custom alias is never shadowed by a stale 404.

### 5.6 Graceful Shutdown & Container Security
- **3-Phase Shutdown**:
  1. `srv.Shutdown(ctx)`: Stop accepting new TCP connections.
  2. Drain In-Flight Requests: 30-second context deadline allows active handlers to finish responses.
  3. Release Infrastructure: Close the PostgreSQL connection pool, then the Redis client.
- **Multi-Stage Docker Build**:
  - Stage 1 (`golang:alpine`): Compiles static CGO-free binary (`CGO_ENABLED=0 -ldflags="-w -s"`).
  - Stage 2 (`scratch`): Minimal image containing only the binary and CA certificates (`ca-certificates.crt`).
  - **Result**: Image size reduced from **604MB to 12MB** with zero OS shell attack surface.

### 5.7 Google Identity: `sub` as the Permanent Anchor
- **Decision**: `google_id` (Google's `sub`) is the *only* field used to match a returning user. Email is a mutable profile attribute, refreshed from the token on every sign-in and never used to locate a row.
- **Why not email**: `sub` is stable and immutable for the life of an account. An address is neither — users rename them, and a Workspace admin can delete an account and reassign its address to someone else. A `UNIQUE(email)` constraint therefore turns a legitimate first sign-in into a constraint violation whenever an address has been seen before under a different Google account.
- **The failure this removes**: recovering from that violation by locating the row by email and overwriting its `google_id` hands the original user's account — and every link they own — to whoever currently controls the address. Migration `003` drops `UNIQUE(email)` so the violation cannot arise; the `23505` branch in `UpsertGoogleUser` now fails the sign-in rather than resolving it, which keeps the code safe on a database where `003` has not yet been applied.
- **Consequence**: two rows may legitimately share an address (a reassigned Workspace address, or tokens issued without email scope). They remain distinct users because their `sub` differs. `UNIQUE(google_id)` still backs the `ON CONFLICT` upsert, and the non-unique `idx_users_email` is retained for lookups.
- **Do not** reintroduce an email-keyed lookup to "handle" `ErrEmailConflict`; that is the vulnerability, not the fix.

### 5.8 Expired Guest Alias Reclamation: Quarantine + Attributable Claimant
- **Problem**: guest links (`user_id IS NULL`) are capped at 30 days and their owner has no dashboard, so before reclamation an expired alias stayed locked forever — it answered `410 Gone` and its short code was permanently burned.
- **Why reclamation is not simply "free it on expiry"**: an alias that is reusable the instant it lapses turns the shortener into a phishing primitive. A guest link shared in a forum post, a QR code, or print outlives its 30-day cap; whoever claims the freed alias inherits every reader still holding the old URL, under this service's domain and its accumulated trust. Note that reclamation only ever fires on **custom aliases** — a randomly generated 7-character Base62 code (~3.5 × 10¹² space) will not collide with an expired guest link in practice — and custom aliases (`promo`, `launch`, `sale`) are exactly the memorable, high-value ones an attacker would target.
- **Two gates**, both in `urlService.reclaimExpiredGuestAlias`:
  1. **Attributable claimant**: the caller must be authenticated. A guest cannot reclaim, so every reclamation maps to an account that can be traced and revoked. This does not stop a determined attacker — registration is cheap — but it removes the anonymous, zero-cost path and leaves an audit trail.
  2. **Quarantine**: the old link must have lapsed longer ago than `guestAliasQuarantine` (30 days), giving casually shared links time to go cold. Expired links already serve `410 Gone`, so delaying reuse costs only alias-space recycling.
- **Cutoff placement**: `RecycleExpiredGuestCode` takes `expiredBefore time.Time` rather than embedding `NOW()` in SQL, keeping the window a service-layer policy and making the boundary exactly testable. A regression to a bare `NOW()` is caught by the "expired AFTER the cutoff is still quarantined" integration test.
- **No transaction**: the reclaim is one conditional `UPDATE` followed by one `INSERT`. If a concurrent request wins the race the `INSERT` returns `ErrURLDuplicate` and the existing retry loop handles it. Nothing is corrupted; the only residue is an already-expired guest link left deactivated, which is the desired end state regardless.

---

## 6. Measured Performance Baselines

All figures below come from the `hey` artifacts under `benchmarks/2026-08-12/`, measured
against the Docker Compose stack on a 12-thread AMD Ryzen 5 5600H with 15 GiB RAM
(`test0-environment-baseline.txt`). Client and server share the host, so these are
relative baselines for comparing configurations, not absolute capacity numbers.

| Scenario | Requests | Concurrency | Throughput | p50 | p99 | Status Distribution | Artifact |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Warm cache redirect | 5,000 | 100 | 7,290 rps | 11.2 ms | 47.8 ms | 100% `302` | `test1-warm-100c-run1` |
| Stress redirect | 50,000 | 500 | 7,636 rps | 60.5 ms | 161 ms | 100% `302` | `test3-stress-500c` |
| Stress redirect | 50,000 | 2,000 | 7,369 rps | 241 ms | 869 ms | 100% `302` | `test3-stress-2000c` |
| 60s soak | 195,357 | 200 | 3,253 rps | 56.5 ms | — | 100% `302` | `test2-soak-60s-200c` |
| Mixed workload (5% miss) | 20,000 | 500 | 1,465 rps | 58.7 ms | 408 ms | 95% `302`, 5% `404` | `test8-mixed-workload-500c` |
| **Redis offline** | 10,000 | 1,000 | 1,021 rps | 669 ms | 1.89 s | **100% `302`** | `test4-outage-1000c` |
| Redis online (same shape) | 5,000 | 1,000 | 5,238 rps | 67.8 ms | 381 ms | 100% `302` | `test4-pre-outage-baseline` |
| Rate-limited write burst | 2,000 | 100 | 9,407 rps | 8.8 ms | 28.9 ms | **10 × `201`, 1,990 × `429`** | `test6-ratelimit-100c` |

### Singleflight A/B (`test5`, 10,000 requests, cold cache)

| Configuration | Throughput | p50 | p99 |
| :--- | :--- | :--- | :--- |
| Singleflight enabled | 5,871 rps | 61.4 ms | 364 ms |
| Singleflight disabled | 4,351 rps | 82.1 ms | 448 ms |

Coalescing is worth **+35% throughput and a 19% p99 reduction** on this workload. The
stronger invariant — that N concurrent misses for one key produce exactly one database
read — is asserted directly by
`TestRedirect_SingleflightCoalescesConcurrentMisses` rather than inferred from throughput.

### Index verification (`test7`)

`EXPLAIN (ANALYZE, BUFFERS)` on the redirect lookup resolves through
`idx_urls_short_code` as an **Index Only Scan with `Heap Fetches: 0`** in 2 shared buffer
hits (0.129 ms execution). Dropping the index inside a transaction forces a bitmap heap
scan over `idx_urls_user_created` (0.591 ms). This confirms the covering index is
structurally doing its job; the timing delta itself is not meaningful, because the test
table held only 33 rows.

---

## 6a. Test Coverage

`go test -race ./...` is the gate; CI (`.github/workflows/ci.yml`) also runs `gofmt`,
`go vet`, a Docker build, and the frontend typecheck.

Because `domain` declares `URLRepository`, `URLCache`, `URLService` and `UserRepository`
as interfaces, the service and handler layers are tested against hand-written doubles
with no mocking library and no database.

| Package | What is covered |
| :--- | :--- |
| `internal/service` | Collision retry and 7→8 length escalation, retry-budget exhaustion, non-duplicate errors not retrying, guest expiry clamping, reserved/malformed custom codes, URL scheme validation, dynamic TTL boundaries, ownership checks on stats and delete, synchronous cache eviction |
| `internal/service` (guest recycling) | Expired guest custom codes and generated collision codes are recycled once and reclaimed, while unexpired guest links and user-owned links remain protected against reclamation |
| `internal/service` (custom code charset) | Aliases are restricted to Base62 plus `-`/`_`: path separators, query and fragment delimiters, whitespace, percent-encoding, NUL and multi-byte UTF-8 are all rejected, while hyphenated and underscored aliases and the 3- and 30-character bounds are accepted |
| `internal/service` (Google claims) | Untrusted, absent and prefix/suffix-spoofed `iss`; foreign and empty `aud`; missing `sub` or `email`; `email_verified` absent, `false`, `"false"` or an unexpected type; both the `"true"` string and boolean spellings accepted; audience errors do not disclose the server's client ID |
| `internal/service` (concurrency) | 100 concurrent misses on one key collapse to exactly 1 database read; leader cancellation does not abort the shared read; 200 concurrent `Shorten` calls yield 200 distinct codes under `-race` |
| `internal/service` (degradation) | Cache transport failure falls back to Postgres; negative caching shields the repository from repeated probes; the sentinel never leaks to a caller |
| `internal/handler` | Full status taxonomy for `POST /shorten` and `GET /stats/{code}`, content-negotiated 404/410 (HTML vs JSON), `Location` header and absolute short URL, empty user list serialized as `[]` not `null`, CORS preflight short-circuit |
| `internal/handler` (rate limiting) | Redis outage triggers 503 fail-closed with `Retry-After` header when `failOpen=false`, and proceeds downstream when `failOpen=true`; errors are logged via `ctxlog` in both paths |
| `internal/handler` (auth) | Missing / malformed / wrongly-signed / expired tokens on every protected route; ownership taken from the token and not forgeable via the request body; a non-owner's link reported as 404 rather than 403; sentinel prefix stripped from 401 error message |
| `internal/handler` (security) | The short code reflected into the generated error page is HTML-escaped |
| `internal/handler` (client IP) | Forged `X-Forwarded-For` from an untrusted peer is ignored; a trusted proxy's chain is walked right-to-left; explicit CIDR overrides; malformed CIDR rejected at startup |
| `internal/config` | Required variables, port normalization, `TRUSTED_PROXIES` parsing, and `RATE_LIMIT_FAIL_OPEN` boolean parsing / fail-fast syntax checks |
| `internal/service` (alias reclamation) | A long-expired guest alias is reclaimed by a signed-in user; an anonymous claimant is refused without ever reaching the repository; a link inside the quarantine window is refused; the cutoff handed down is `now - guestAliasQuarantine`; unexpired guest links and member-owned links are never recycled |
| `internal/repository/postgres` (alias reclamation) | The `expires_at < $2` predicate at its boundary: expired before the cutoff recycles and the alias is reclaimable, expired after the cutoff stays locked and active, unexpired and member-owned links are untouched |
| `internal/shortcode` | Generator uniqueness over 10,000 sequential draws |
| `internal/repository/postgres` (safety guard) | `assertTestDatabase` refuses to run tests/migrations/truncations unless database name ends in `_test` |
| `internal/repository/postgres` (integration) | Deterministic active-row preference on `GetStats`, single-row click increment predicate, and expired guest link recycling and alias reclamation |

---

## 7. Known Limitations

1. **Single Node**: This is a single-instance deployment. `singleflight.Group` deduplicates only within one process, so a multi-node rollout would issue one cold-cache query per instance. Nothing in this design is distributed beyond the shared Redis and Postgres.
2. **IP-Based Rate Limiting**: Rate limiting keys on client IP, so users behind a shared NAT share a quota. Attribution is only as trustworthy as `TRUSTED_PROXIES` is configured to be (§5.4).
3. **Rate Limit Coverage & Degraded Mode**: Only `POST /shorten` is rate limited. The redirect hot path and `POST /auth/google` are not. By default, the rate limiter fails closed (503 Service Unavailable with `Retry-After`) when Redis is unreachable, protecting against unbounded link creation during outages. In degraded mode (server booted without Redis), `POST /shorten` returns 503 unless `RATE_LIMIT_FAIL_OPEN=true` is explicitly set.
4. **Unbatched Click Writes**: Each redirect spawns a detached goroutine issuing its own `UPDATE`, with no worker pool, no backpressure, and no coalescing — the 60-second soak in §6 issued 195,357 individual updates. Batching is designed but not built (§8).
5. **Analytics Durability**: Because increments are detached (`context.Background()`), an abrupt `SIGKILL` or power loss drops whatever was in flight. Graceful shutdown drains HTTP handlers but does not wait on these goroutines.
6. **No Expiry Reaper**: `idx_urls_expires_at` exists to support a background cleanup worker that has not been written; expired rows are filtered at read time and never reclaimed automatically in background (only on collision via guest recycling).
7. **Schema Migrations**: Migrations are raw `.sql` files applied by the Postgres entrypoint on first boot. There is no version table, no rollback, and no mechanism for applying a migration to an already-initialized database.
8. **No Transactions**: Every operation is a single statement, so none currently require one. Any future multi-statement invariant would need explicit transaction handling.
9. **Permissive CORS**: `Access-Control-Allow-Origin: *`. Acceptable for a public read API with token-bearing writes, but it is not an origin restriction.
10. **Google Token Verification Cost**: `AuthenticateGoogle` verifies ID tokens by calling Google's `tokeninfo` endpoint, adding a network round trip per sign-in and making Google a hard dependency of the login path. Local JWKS/RS256 verification would remove both. Signature and expiry are delegated to that endpoint; the `iss`, `aud`, `sub`, `email` and `email_verified` claims are checked locally in `validateGoogleClaims` (§5.7). A move to JWKS would additionally have to verify `exp`/`nbf` here.
11. **Outbound Token Interpolation**: the ID token is concatenated into the `tokeninfo` query string without escaping, so a caller can append arbitrary query parameters to that request. Google ignores unknown parameters and a mangled token simply fails verification, so the path fails closed, but the token should be passed through `url.QueryEscape`.

---

## 8. Horizontal Scaling & Future Architecture (Phase 3)

1. **Distributed Singleflight (Redis SETNX Locks)**: Replace/supplement in-process singleflight with a distributed Redis lock to ensure only 1 query hits PostgreSQL across $N$ application instances during a cold cache miss.
2. **Asynchronous Click Batching**: Buffer click events in Redis Streams or Apache Kafka, processing writes to PostgreSQL via background worker pools in bulk (`UPDATE urls SET click_count = click_count + N`) to eliminate individual DB write overhead.
3. **Database Read Replicas & Sharding**: Route `GET /:code` cache-miss reads to PostgreSQL Read Replicas while directing `POST /shorten` writes to the Primary DB. Shard the `urls` table by `short_code` hash when storage exceeds single-node capacity.