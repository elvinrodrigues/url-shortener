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