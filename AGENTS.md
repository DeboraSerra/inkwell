# Agent guide: Inkwell

Read this before changing anything in this repository. It explains what is being built, where things stand, and the rules every agent must follow.

## What this project is

**Inkwell** is an online reading journal. It's built for one person but designed to support more users later. You can:

- Import your Kindle library through a Chrome extension. The imported books form the **ebook TBR** list.
- Keep a **physical TBR** (added by hand or by search) and a **wishlist** (added by ISBN or search).
- Log reading sessions, review finished books, and track flexible **reading goals**. The default goal is books per year.
- Have the Claude API enrich each book with genres, tropes, tags and a length category.

The project started as a "book categorizer". The repo folder name still reflects that.

## Repository layout

| Path | What it is |
|---|---|
| `inkwell/` | The app: Next.js 16 (App Router), React 19, Tailwind 4, Prisma 7 + Postgres, Firebase Auth |
| `extension/` | Chrome extension (MV3) that scrapes the Amazon Kindle content list. **The misspelling is intentional for now; don't rename it without asking.** |
| `extension/firebase-project/` | Legacy Firebase Hosting project, not used by the app |
| `docs/plan/` | **The plan, and the source of truth for scope and status.** `README.md` holds the decisions and the phase index; there is one file per phase. |
| `PLAN.md` | Outdated single-file version of the plan. Use `docs/plan/` instead. |

Key files in `inkwell/`:

| Path | Purpose |
|---|---|
| `src/proxy.ts` | Optimistic auth redirect (checks only that the cookie exists). Next 16 calls this `proxy`, not `middleware`. |
| `src/lib/auth/session.ts` | `createSession`, `getCurrentUser`, `requireUser`: the real session verification |
| `src/lib/auth/api-tokens.ts` | Personal API tokens for the extension; `getRequestUser(request)` for route handlers |
| `src/lib/auth/actions.ts` | `signIn` / `signOut` server actions |
| `src/config/firebase.ts`, `src/config/firebase-admin.ts` | Firebase client SDK and Admin SDK |
| `src/lib/prisma.ts` | Prisma client singleton (uses the pg driver adapter) |
| `src/lib/books/` | Catalog helpers: `isbn.ts`, `dedupe.ts` (pure, unit-tested), `catalog.ts` (DB lookup) |
| `prisma/schema.prisma`, `prisma/migrations/` | Database schema and migrations |
| `prisma/seed.ts`, `assets/lists/` | Idempotent seed for the curated genres and tropes |
| `prisma/load-env.ts` | Loads `.env.local`, then `.env`, for the Prisma CLI and the seed |

## Current status

See `docs/plan/README.md` for live status. At the time of writing:

- ✅ Phase 0: security upgrades (Next 16.4, Prisma 7, npm `overrides`)
- ✅ Phase 1: Firebase Google sign-in → httpOnly `__session` cookie; API tokens; `/settings`; `GET /api/me`
- ✅ Phase 2a: shared `Book` catalog, `BookGenre`/`BookTrope`, dedupe and ISBN helpers, Vitest
- ⏭️ Next: Phase 2b (`UserBook` library), then 2c (shelves), 2d (journal), 2e (goals and imports), then Phases 3–7

## Workflow rules

1. **Start from the plan.** Read the relevant phase in `docs/plan/` before coding, and stay within it. If the work needs something the plan doesn't cover, or contradicts it, ask the user first.
2. **Update the plan when you finish.** Mark the phase or sub-phase status in its file and in `docs/plan/README.md`. Add an "Outcome" section listing what was built, any deviations, and anything the user must do.
3. **Don't commit, push, create branches, or open PRs unless the user asks.** Work on the current branch and leave changes uncommitted; the user reviews and commits. Don't stage files either.
4. **Verify before you report.** From `inkwell/`, run `npx tsc --noEmit`, `npm run lint`, `npm test` and `npm run build`. If a change is visible in the app, also run it (the root `.claude/launch.json` defines an `inkwell` dev server) and check the affected routes. Report failures honestly, with the output.
5. **Ask before doing anything destructive.** Resetting or dropping the database, deleting migrations, or deleting user data all need explicit confirmation. `prisma migrate reset` refuses to run for AI agents without consent; never fake that consent.

## Next.js 16 rules

- The `node_modules/next/dist/docs/` docs are authoritative; your training data is out of date. Read the relevant guide before writing Next-specific code (see `inkwell/AGENTS.md`).
- Use `proxy.ts`, never `middleware.ts`. The proxy only runs optimistic checks and never touches the database.
- `cookies()`, `headers()`, `params` and `searchParams` are async: always `await` them.
- Prefer Server Components, with Server Actions for mutations. Use `"use client"` only for interactivity.
- Put `import "server-only"` in any module that touches secrets, the Admin SDK, or the database from app code. **Exception:** `src/lib/prisma.ts` must stay importable by the seed script, so don't add it there.

## Auth and data security rules

- **Every page, server action and route handler verifies the user itself.** Use `requireUser()` (pages and actions) or `getRequestUser(request)` (route handlers, which accept a Bearer API token or the session cookie). Never rely on the proxy for security.
- **Every query on per-user data filters by `userId`,** and functions in the data access layer take `userId` as their first argument. Use `updateMany`/`deleteMany` with `{ id, userId }` so one user can't touch another's rows.
- **Shared catalog vs. per-user data:** `Book`, `Genre` and `Trope` are shared. Status, ownership, shelves, sessions, reviews and goals belong in per-user tables (Phase 2b onward). Never put per-user state on `Book`.
- **Validate every input from the client or the extension** (types, lengths, ranges). Treat titles, authors and every other scraped field as untrusted.
- **Redirect targets** must be relative paths (see `safeRedirectPath` in `src/lib/auth/actions.ts`).
- **API tokens** are stored only as SHA-256 hashes and shown once. Never log or return them afterwards.
- **Regexes that run on untrusted text must not backtrack badly** (no `[^)]*\)`-style patterns that can rescan). SonarQube flags these.

## Secrets and environment

- Real values live in `inkwell/.env.local`; `inkwell/.env` holds only `DATABASE_URL`. **Never print, copy, or commit their values.** If you need to know what's configured, list the variable names only.
- Don't edit `.env.local`. Tell the user which variables to add, and document new ones with placeholders in `inkwell/.env.example`, which is the only env file that gets committed.
- `NEXT_PUBLIC_*` variables are shipped to the browser. Use the prefix only for genuinely public values (the Firebase web config). Server secrets (`FIREBASE_PRIVATE_KEY`, `DATABASE_URL`, and `ANTHROPIC_API_KEY` from Phase 5) must never have it.
- The Next dev server logs server-action arguments, including the sign-in ID token. Don't paste those logs anywhere public.

## Database and Prisma 7 rules

- The connection URL belongs in `prisma.config.ts`, not in `schema.prisma`. At runtime, `DATABASE_URL` (pooled on Neon) is used; migrations use `DIRECT_URL` when it's set.
- `PrismaClient` requires the driver adapter. Always import the singleton from `@/lib/prisma`; never call `new PrismaClient()` anywhere else.
- **Migrations are additive from now on.** Change `schema.prisma`, then create a new migration (`npx prisma migrate dev --name <change>`). If there's no interactive terminal, write `migration.sql` with `prisma migrate diff`. Never edit a migration that has already been applied.
- After a schema change, run `npx prisma generate`. The generated client lives in `src/generated/prisma` and is gitignored.
- The seed must stay idempotent (upsert by unique name). To run it: `npx prisma db seed`.
- Store dates as UTC; reading-log and goal dates are calendar dates.

## Code style and quality

- **Match the surrounding code:** TypeScript, two-space indentation, double quotes, named exports for helpers and default exports for pages and components. Use Tailwind with `dark:` variants and mobile-first layouts.
- **Comments are sparse and explain *why*,** not what.
- **Keep pure logic separate from database access** (as with `dedupe.ts` vs `catalog.ts`) so it can be unit-tested without Prisma. Tests live next to the code as `*.test.ts`.
- **The user runs SonarQube/SonarLint.** Write code that passes the "Sonar way" profile:
  - Mark component props `Readonly<…>`.
  - No non-null assertions (`!`).
  - Use `replaceAll` rather than `replace` with a `/g` regex.
  - Use `String.raw` for backslash-heavy strings, except in the proxy `matcher`, which must be a plain string literal.
  - Use `globalThis` rather than `window`.
  - Use top-level `await` rather than `.then` chains in scripts.
  - Use a single boolean `return` rather than `if (x) return true; return false`.
  - Avoid super-linear regexes.
- **`inkwell/package.json` has `"type": "module"`,** so scripts are ESM.

## Dependencies

- Use npm, run from `inkwell/`. npm here blocks dependency install scripts; `prisma generate` runs from the package's own `postinstall` and `build` scripts.
- **Don't remove the `overrides` in `package.json`.** They patch vulnerable transitive dependencies that upstream hasn't fixed yet. Re-check them with `npm audit` when upgrading.
- The only known remaining `npm audit` finding is `braces` (dev-only, via `eslint-config-next`), which has no fixed version.
- Ask before adding significant dependencies, and pin to an exact or caret version of a release at least two weeks old.

## Domain rules (keep these consistent)

- **Dedupe order:** ASIN → ISBN-13 (convert ISBN-10 with `toIsbn13`) → `dedupeKey`, which is the normalized title plus the first author's surname. Re-importing a book never overwrites a user's data.
- **Genres and tropes** come only from the curated lists in `assets/lists/`. The AI picks from these lists; `source: AI | USER` records who attached each one, and AI updates must never overwrite `USER` rows.
- **Goal progress** is always computed, never stored.
- **The three lists** (Ebook TBR, Physical TBR, Wishlist) are system `Shelf` rows, not hard-coded enums, so custom shelves can be added later (Phase 2c).
- **AI** uses the Claude API from server-only code (Phase 5). Enrichment runs once per catalog `Book`, and Message Batches are used for large imports.
