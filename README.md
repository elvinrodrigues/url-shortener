# Slug — URL Shortener

A read-heavy URL shortening and redirection service written in Go, backed by PostgreSQL
for durability and Redis for the hot redirect path, with a React frontend.

Short codes are generated with a CSPRNG over a Base62 alphabet, redirects are served
cache-aside with negative caching and in-process request coalescing, and the service keeps
serving redirects straight from PostgreSQL when Redis is unavailable.

The design rationale, tradeoff analysis and measured benchmarks live in
[ARCHITECTURE.md](ARCHITECTURE.md). Planned work is tracked in [TODO.md](TODO.md).

## Live deployment

| | URL |
| :--- | :--- |
| App | <https://trimto.me> |
| Vercel domain | <https://url-shortener-one-sandy.vercel.app> |
| API | <https://url-shortener-api-sgto.onrender.com> |

The apex answers with a `308` to `www.trimto.me`, and the shortener treats the apex and
`www` host as the same deployment when rejecting self-referential destinations. Short
codes are served from the app domain: Vercel rewrites `/:code` to the API, so a link reads
as `trimto.me/abc1234` while the redirect is resolved by the Go service.

The API runs on a free Render instance, so the first request after an idle period pays a
cold start.

## Features

- **Anonymous and authenticated shortening.** Guests may create links; signing in with
  Google adds a dashboard, per-link stats and ownership.
- **Custom aliases.** 3 to 30 characters from Base62 plus `-` and `_`, with system
  keywords such as `health`, `shorten` and `auth` reserved.
- **Expiring links.** Guest links are capped at 30 days. An expired code answers `410
  Gone` rather than `404`, and expired guest aliases are only recycled after a 30-day
  quarantine, by a signed-in claimant.
- **Click analytics.** Counters are incremented off the redirect's critical path.
- **Per-IP rate limiting.** A Redis Lua sliding window allows 10 writes per minute and
  fails closed by default.
- **Graceful degradation.** Redis loss costs latency, not availability. Liveness and
  readiness are separate probes so a cache blip cannot trigger a restart loop.

## Stack

| Layer | Choice |
| :--- | :--- |
| API | Go 1.26, standard library `net/http` routing |
| Database | PostgreSQL 15, partial covering indexes |
| Cache and rate limiter | Redis 7, `allkeys-lru` |
| Auth | Google Identity, ID tokens verified locally against Google's JWKS, app-issued HS256 JWTs |
| Frontend | React 19, TypeScript, Vite |
| Container | Multi-stage build onto `scratch` |

## Quick start

The fastest path is Docker Compose, which brings up PostgreSQL, Redis and the API
together. Migrations run automatically only on a fresh database volume.

```bash
docker compose up --build
```

The API then answers on `http://localhost:8000`.

```bash
curl -X POST http://localhost:8000/shorten -H 'Content-Type: application/json' -d '{"long_url":"https://example.com"}'
```

### Running the API directly

You need PostgreSQL and Redis reachable, then apply migrations and start the server.

```bash
DATABASE_URL=postgres://appuser:password123@localhost:5432/urlshortener?sslmode=disable go run ./cmd/migrate
```

```bash
DATABASE_URL=postgres://appuser:password123@localhost:5432/urlshortener?sslmode=disable JWT_SECRET=dev-secret GOOGLE_CLIENT_ID=your-client-id go run ./cmd/server
```

Migrations are a separate command on purpose. Auto-migrating at startup would let
multiple instances race on DDL and would make a bad migration harder to back out.

### Running the frontend

```bash
cd web && npm install && npm run dev
```

Set `VITE_API_BASE_URL` to the API origin. It is required for production builds. To skip
Google sign-in during local development, mint a token and put it in `web/.env.local` as
`VITE_DEV_TOKEN`.

```bash
JWT_SECRET=dev-secret go run ./cmd/gentoken -user 1 -ttl 24h
```

## Configuration

Server environment variables:

| Variable | Required | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | yes | — | PostgreSQL connection string |
| `JWT_SECRET` | yes | — | HMAC secret for application JWTs |
| `GOOGLE_CLIENT_ID` | yes | — | Audience checked on Google ID tokens |
| `REDIS_ADDR` | no | `localhost:6379` | Cache and rate limiter address |
| `PORT` | no | `:8000` | Listen address |
| `BASE_URL` | no | `http://localhost:8000` | Origin used to build short URLs and to reject self-referential destinations |
| `TRUSTED_PROXIES` | no | loopback and private ranges | CIDRs whose `X-Forwarded-For` is believed. `*` trusts every peer and reopens header spoofing |
| `RATE_LIMIT_FAIL_OPEN` | no | `false` | Whether write-path rate limiting fails open when Redis is down |

Frontend variables: `VITE_API_BASE_URL`, `VITE_GOOGLE_CLIENT_ID`, `VITE_DEV_TOKEN`.

## API

| Method and path | Auth | Description |
| :--- | :--- | :--- |
| `POST /shorten` | optional | Create a short link. Returns `201` with `short_url`, `short_code` and a `Location` header |
| `GET /{code}` | none | `302` to the destination, `404` if unknown, `410` if expired |
| `DELETE /{code}` | required | Deactivate a link you own. `404` also covers another user's link, to prevent enumeration |
| `GET /stats/{code}` | required | Click count, timestamps and active status |
| `GET /user/urls` | required | Every link owned by the caller |
| `DELETE /user/urls/expired` | required | Batch deactivate the caller's expired links, returns `{"deleted": n}` |
| `POST /auth/google` | none | Exchange a Google ID token for an application JWT |
| `GET /health` | none | Liveness. No dependency checks, always `200` while the process answers |
| `GET /ready` | none | Readiness. `503` when PostgreSQL is down, `200` with `degraded` when only Redis is down |

Protected endpoints take `Authorization: Bearer <token>`. The full status-code mapping,
including every `422` case on `POST /shorten`, is documented in section 4 of
[ARCHITECTURE.md](ARCHITECTURE.md).

## Testing

```bash
go test -race ./...
```

Repository tests need a throwaway database and skip themselves when it is absent. The
race detector matters here: the coalescing and concurrent-insert tests are only
meaningful with it enabled.

```bash
TEST_DATABASE_URL=postgres://appuser:password123@localhost:5432/urlshortener_test?sslmode=disable go test -race ./...
```

Continuous integration checks `gofmt`, `go vet`, the test suite against a live PostgreSQL
service, the Docker image build, and the frontend typecheck and build.

## Layout

```text
cmd/server      API entrypoint, routing and graceful shutdown
cmd/migrate     Applies embedded SQL migrations
cmd/gentoken    Mints a development JWT
internal/domain Entities, service and repository interfaces, sentinel errors
internal/service Shortening, redirect, expiry and auth logic
internal/repository PostgreSQL and Redis implementations
internal/handler HTTP handlers, auth, rate limiting, logging, CORS
migrations      Embedded schema migrations
web             React frontend
benchmarks      hey load-test artifacts referenced by ARCHITECTURE.md
```

## Notes

Do not shorten links to illegal, phishing or otherwise harmful content.
