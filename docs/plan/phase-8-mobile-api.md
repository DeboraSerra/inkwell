# Phase 8 — Mobile API

[← Plan overview](README.md)

⏳ Planned, not started. Added on 2026-11-21. It starts only once a mobile app is actually planned, and after Phase 6 (journal), once the data model has settled. It's the first step of any mobile work, before [Phase 9](phase-9-mobile-app.md) builds the app.

## Why

A native app can't rely on server actions, which are made for the web pages. It needs a stable JSON API over HTTP. No separate server is needed: the services and models are framework-agnostic and stay as they are, and only a controller layer is added. A separate server would only be worth it for long-running jobs, websockets or real-time sync, none of which the plan needs.

## Before this phase

- **Decide between a native app and a PWA.** An installable web app (a manifest, icons and offline caching of the shell) may cover most of the need without this phase; barcode scanning already works in a phone's browser.

## Steps

### 8a — Auth for the app

- `getRequestUser` in `auth/auth.guard.ts` also accepts a **Firebase ID token** as `Authorization: Bearer`, verified with the Admin SDK (`verifyIdToken`, with revocation checked). API tokens and the session cookie keep working, and an API token and an ID token are told apart reliably (for example by the API token's prefix).
- The user is found or created as at web sign-in, through `auth.service`.
- **Done when:** a request with a valid ID token reaches a route as that user; an expired, revoked or foreign-project token gets 401.

### 8b — A versioned JSON API

- Route handlers under `app/api/v1/`, as thin controllers over the existing services, for what the web app does through server actions: the shelf (list, filter, sort, paginate), adding a book (manual, ISBN, search), editing, moving, changing formats, removing, reads, the journal (Phase 6), and `GET /api/v1/me`.
- **Inputs** use the same zod schemas as the server actions, moved out of FormData parsing where needed so both share one schema. **Outputs** are explicit response types in `src/types/`, never raw Prisma records.
- **Errors:** `domainErrorResponse` everywhere, with one JSON error shape (`{ error: { code, message } }`); 429 with `Retry-After` for the rate limits.
- **Rate limits** as on the web, through `consumeRateLimit`.
- The existing `/api/books/search`, `/api/imports/amazon` and `/api/me` stay, for the web and the extension.
- **Done when:** every action the web app offers has a `/v1` route with tests (auth, validation, `userId` scoping, error shape), and the server actions still work.

### 8c — Stability and docs

- **Versioning:** a released `/v1` route never changes incompatibly; a breaking change goes in `/v2`, with `/v1` kept until old app versions are gone.
- **An OpenAPI description** of `/v1`, checked in tests against the zod schemas so it can't drift.
- **CORS** only if a browser client needs it; a native app doesn't.
- **Privacy policy:** says what the app sends and stores.
- **Done when:** the OpenAPI file covers every `/v1` route and the test that compares it with the schemas passes.

## Open questions

1. Native app or PWA (see "Before this phase").
2. Which stack the app uses (for example React Native with Expo), which decides only the client, not this API.
3. Whether the app needs offline use. That would need sync rules (for example last write wins per field) and is a larger change.
