# Slug — Frontend

The React frontend for the Slug URL shortener. It talks to the Go API documented in the
[root README](../README.md) and is deployed on Vercel.

| | URL |
| :--- | :--- |
| App | <https://trimto.me> |
| Vercel domain | <https://url-shortener-one-sandy.vercel.app> |
| API | <https://url-shortener-api-sgto.onrender.com> |

## Stack

React 19 with TypeScript, built by Vite 6. Icons come from `lucide-react` and QR codes
from `qrcode`. Linting is Oxlint. There is no CSS framework or state library.

## Running locally

```bash
npm install && npm run dev
```

The dev server listens on port 5173 with `host: true`, so it is reachable from other
devices on the network. With no `VITE_API_BASE_URL` set, the client falls back to
`http://localhost:8000`, which is where the API listens by default.

| Script | Purpose |
| :--- | :--- |
| `npm run dev` | Vite dev server with hot module replacement |
| `npm run build` | TypeScript project build, then a production bundle into `dist/` |
| `npm run preview` | Serve the built bundle locally |
| `npm run lint` | Oxlint over `src` |

## Environment

Copy `.env.local.example` to `.env.local`. All three variables are optional in
development.

| Variable | Purpose |
| :--- | :--- |
| `VITE_API_BASE_URL` | API origin. Required for production builds, where the build throws without it |
| `VITE_GOOGLE_CLIENT_ID` | Google Identity client ID used by the sign-in modal |
| `VITE_DEV_TOKEN` | A pre-minted JWT that signs you in without Google. Development builds only |

To skip Google sign-in locally, mint a token with the same secret the API runs with and
put it in `.env.local`.

```bash
JWT_SECRET=dev-secret go run ../cmd/gentoken -user 1 -ttl 24h
```

## How it works

- **Guest history lives in the browser.** Links created while signed out are kept in
  `localStorage` under `slug_guest_history`. Clearing expired guest links touches only
  local storage and makes no API call. Signing in switches the dashboard to the
  server-owned list from `GET /user/urls`.
- **The session token is stored client-side.** The JWT and user profile are held in
  `localStorage` as `slug_jwt_token` and `slug_user`, and sent as a bearer token.
- **Short links use the app's own origin.** The client builds short URLs from
  `window.location.origin`, not from the API origin, so links read as `trimto.me/abc1234`.
- **Routing is handled by rewrites.** `vercel.json` sends `/`, `/dashboard` and `/links`
  to the single page app, and rewrites anything matching a short code to the API so the
  redirect is resolved server-side.
- **Theme choice persists** in `localStorage` under `slug-theme`.

## Deployment

Vercel builds this directory and serves `dist/`. The rewrite that forwards `/:code` to the
API is in `vercel.json` and hardcodes the Render origin, so it has to be updated if the
API moves. Continuous integration runs `npm ci` and `npm run build` on every push and
pull request.
