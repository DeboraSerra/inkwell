# Phase 1 — Foundation and auth

[← Plan overview](README.md)

**Status: ✅ Implemented on `dev`, not committed.** Needs an end-to-end sign-in test once Firebase Admin credentials and the database are set up.

- Clean up the repo: delete the tracked `.DS_Store` and add it to `.gitignore`. Decide whether the vendored `.agents/.claude/.kiro` skill folders inside `extention/firebase-project` should stay.
- Firebase Auth on the client (Google sign-in). On the server, `firebase-admin` verifies the ID token and sets an httpOnly session cookie. Next.js `proxy`/middleware protects the app routes.
- `getCurrentUser()` helper. The `User` row is created on first login, using the Firebase UID as its id.
- Extension auth: a **personal API token** that you generate in Settings. Only a hash is stored in the DB. The extension sends it as `Authorization: Bearer`. This avoids running Firebase login inside the extension.
- Env/config for Vercel and Neon, with a pooled connection string for runtime and a direct one for migrations.

## Outcome

- **Repo cleanup:** removed the tracked root `.DS_Store` and added a root `.gitignore`. Un-ignored `inkwell/.env.example` so it can be committed. The vendored agent skill folders in `extention/firebase-project` were left as they are.
- **Firebase client:** `src/config/firebase.ts` exports `auth`. Sign-in uses Google in a popup with in-memory persistence. The ID token goes to the `signIn` server action, and the client then signs out of Firebase, so the httpOnly `__session` cookie (14 days) is the only session.
- **Firebase Admin:** `src/config/firebase-admin.ts` uses `FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY` when they're set, and falls back to application default credentials otherwise.
- **Session:** originally `src/lib/auth/session.ts`; now `src/server/auth/` (`auth.service.ts` for logic, `auth.guard.ts` for cookies, `auth.controller.ts` for actions). `createSession` requires a sign-in from the last 5 minutes and upserts the `User` (id = Firebase UID). `getCurrentUser` and `requireUser` verify the cookie with revocation checks.
- **`src/proxy.ts`:** an optimistic cookie-presence check that redirects to `/login?next=…`. Real verification happens in pages and actions. API routes are excluded and do their own auth.
- **API tokens:** new `ApiToken` model (its migration is now part of the single `init`). Tokens look like `ink_…` and only their SHA-256 hash is stored. Create and revoke them on `/settings`. `getRequestUser(request)` accepts a Bearer token or the session cookie.
- **`GET /api/me`:** lets the extension check that its token works.
- **Env and deploy:** `.env.example` documents every variable. `DIRECT_URL` is used for migrations (Neon) and `DATABASE_URL` (pooled) at runtime. The Prisma CLI and seed load `.env.local` and then `.env`. `build` and `postinstall` run `prisma generate`. The Prisma client is a singleton in development.
