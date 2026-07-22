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