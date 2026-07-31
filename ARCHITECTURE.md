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
3. **Graceful Degradation**: Continue serving redirects from PostgreSQL if Redis experiences downtime or network partitions (fail-open architecture).
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
- **Fail-Open Policy**: If Redis is unreachable, `RateLimitMiddleware` catches the error, logs a warning, and passes requests downstream to preserve service availability.

### 5.5 Cache Stampede Prevention: In-Process `singleflight`
- **Vulnerability**: When a hot key expires in Redis, thousands of concurrent requests miss the cache simultaneously and hit PostgreSQL with identical `SELECT` queries (Thundering Herd).
- **Chosen Design**: `golang.org/x/sync/singleflight`.
- **Mechanism**: The first request triggers `sf.Do(code, fn)` to execute the database query and populate Redis synchronously. Subsequent concurrent requests for the same code block and share the result of the initial call. Under a 50-worker concurrent cold cache load test, Postgres received **exactly 1 DB query**.

### 5.6 Graceful Shutdown & Container Security
- **3-Phase Shutdown**:
  1. `srv.Shutdown(ctx)`: Stop accepting new TCP connections.
  2. Drain In-Flight Requests: 30-second context deadline allows active handlers to finish responses.
  3. Release Infrastructure: Close PostgreSQL database pools and Redis connections.
- **Multi-Stage Docker Build**:
  - Stage 1 (`golang:alpine`): Compiles static CGO-free binary (`CGO_ENABLED=0 -ldflags="-w -s"`).
  - Stage 2 (`scratch`): Minimal image containing only the binary and CA certificates (`ca-certificates.crt`).
  - **Result**: Image size reduced from **604MB to 12MB** with zero OS shell attack surface.

---

## 6. Measured Performance Baselines

Load testing was conducted using `hey` under 100 concurrent workers (`-c 100`).

| Scenario | Total Requests | Concurrency | Throughput (RPS) | p50 Latency | p99 Latency | Status Distribution |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Warm Cache Redirect** (`GET /:code`) | 5,000 | 100 | **14,995 req/sec** | **5.2 ms** | **26.2 ms** | 100% `302 Found` |
| **Cold Cache Redirect** (Post-`FLUSHALL`) | 5,000 | 100 | **15,003 req/sec** | **5.2 ms** | **25.3 ms** | 100% `302 Found` (Coalesced via singleflight) |
| **Write Burst Path** (`POST /shorten`) | 1,000 | 50 | **15,634 req/sec** | **2.3 ms** | **12.5 ms** | 1% `201 Created` (10 req), 99% `429 Rate Limited` |

---

## 7. Known Limitations

1. **In-Process Singleflight Scope**: `singleflight.Group` deduplicates concurrent requests within a single application instance. In a multi-node deployment, cold cache stampedes will issue 1 DB query per application instance.
2. **IP-Based Rate Limiting**: Rate limiting relies on client IP (`X-Forwarded-For` / `RemoteAddr`). Users behind corporate NATs share a rate limit quota.
3. **Eventual Consistency in Analytics**: Click count increments (`IncrementClicks`) are executed in detached asynchronous goroutines (`context.Background()`). Sudden server crashes (e.g. `SIGKILL` or power loss) can result in minor click undercounting (~0.01%).

---

## 8. Horizontal Scaling & Future Architecture (Phase 3)

1. **Distributed Singleflight (Redis SETNX Locks)**: Replace/supplement in-process singleflight with a distributed Redis lock to ensure only 1 query hits PostgreSQL across $N$ application instances during a cold cache miss.
2. **Asynchronous Click Batching**: Buffer click events in Redis Streams or Apache Kafka, processing writes to PostgreSQL via background worker pools in bulk (`UPDATE urls SET click_count = click_count + N`) to eliminate individual DB write overhead.
3. **Database Read Replicas & Sharding**: Route `GET /:code` cache-miss reads to PostgreSQL Read Replicas while directing `POST /shorten` writes to the Primary DB. Shard the `urls` table by `short_code` hash when storage exceeds single-node capacity.