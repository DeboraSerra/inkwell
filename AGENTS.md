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

Key files in `inkwell/`:

| Path | Purpose |
|---|---|
| `src/proxy.ts` | Optimistic auth redirect (checks only that the cookie exists). Next 16 calls this `proxy`, not `middleware`. |
| `src/server/` | **The backend**, split into model / service / controller layers by feature module. See "Backend architecture" below. |
| `src/server/auth/` | `auth.guard.ts` (`getCurrentUser`, `requireUser`, `getRequestUser`), `auth.controller.ts` (sign-in/out and API-token server actions), `auth.service.ts`, `user.model.ts`, `api-token.model.ts` |
| `src/config/firebase.ts`, `src/config/firebase-admin.ts` | Firebase client SDK and Admin SDK |
| `src/server/db.ts` | Prisma client singleton (pg driver adapter), the `Db`/`Tx` types and the `transaction()` helper |
| `src/server/errors.ts` | Domain errors (`NotFoundError`, `ValidationError`, `UnauthorizedError`) and `domainErrorResponse()` for route handlers |
| `src/server/books/` | Shared catalog: `isbn.ts` and `dedupe.ts` (pure), `book.model.ts`, `book.service.ts` (`findExistingBook`) |
| `src/server/library/` | Per-user library: `status.rules.ts` (statuses, formats and read changes; pure), `library.model.ts`, `read-through.model.ts`, `library.service.ts`, `library.controller.ts`, `manual-book.schema.ts` (zod) |
| `src/server/metadata/` | Book details from Open Library and Google Books (Phase 4a): `metadata.service.ts` (`lookupIsbn`, `searchBooks`), one `*.provider.ts` per source, `sanitize.ts` (pure cleaners for untrusted fields), `http.ts` (timeout, size cap, day-long cache) |
| `src/server/rate-limit/` | Per-user request limits counted in Postgres: `consumeRateLimit` throws `RateLimitError` (HTTP 429) |
| `prisma/schema.prisma`, `prisma/migrations/` | Database schema and migrations |
| `prisma/seed.ts`, `assets/lists/` | Idempotent seed for the curated genres and tropes |
| `prisma/load-env.ts` | Loads `.env.local`, then `.env`, for the Prisma CLI and the seed |

## Current status

See `docs/plan/README.md` for live status. At the time of writing:

- ✅ Phase 0: security upgrades (Next 16.4, Prisma 7, npm `overrides`)
- ✅ Phase 1: Firebase Google sign-in → httpOnly `__session` cookie; API tokens; `/settings`; `GET /api/me`
- ✅ Phase 2a: shared `Book` catalog, `BookGenre`/`BookTrope`, dedupe and ISBN helpers, Vitest
- ✅ Phase 2b: `UserBook` library, status/ownership rules (`src/server/library/status.rules.ts`), `library.service.ts` / `library.model.ts`
- ✅ Backend refactored into model / service / controller layers under `src/server/`; Biome enforces the boundaries
- ✅ Phase 2c: `Shelf`/`ShelfItem`, system shelves per user kept in sync with status and ownership, sparse ordering (`src/server/shelves/`)
- ✅ Phase 3a: `UserBook.formats`, status as the list, `ReadThrough` read history; the shelves from 2c are removed
- ✅ Phase 3b: manual add at `/books/new`, validated with zod (`library/manual-book.schema.ts`)
- ✅ Phase 3c: extension import through `POST /api/imports/amazon` (`src/server/imports/`), run on the real Amazon page; the import dialog asks Books or Docs, since the Docs tab's address can't be relied on
- ✅ Phase 3d: browse, filter and move books at `/books/shelves`
- ✅ Phase 4a: metadata providers (Open Library, Google Books) and the per-user rate limit
- ✅ Phase 4b: add by ISBN on `/books/new` (ISBN and Manual tabs); covers through `components/BookCover.tsx`, with Open Library and Google covers served by Next's image optimizer (`images.remotePatterns` in `next.config.ts`)
- ✅ Phase 3's "Done when" list checked on 2026-11-08
- ⏭️ Next: Phase 4c (search). Publishing the extension is in `docs/plan/phase-7-quality-deploy.md`

## Workflow rules

1. **Start from the plan.** Read the relevant phase in `docs/plan/` before coding, and stay within it. If the work needs something the plan doesn't cover, or contradicts it, ask the user first.
2. **Update the plan when you finish.** Mark the phase or sub-phase status in its file and in `docs/plan/README.md`. Add an "Outcome" section listing what was built, any deviations, and anything the user must do.
3. **Don't commit, push, create branches, or open PRs unless the user asks.** Work on the current branch and leave changes uncommitted; the user reviews and commits. Don't stage files either.
4. **Verify before you report.** From `inkwell/`, run `npx tsc --noEmit`, `npm run lint`, `npm test` and `npm run build`. If a change is visible in the app, also run it (the root `.claude/launch.json` defines an `inkwell` dev server) and check the affected routes. Report failures honestly, with the output.
5. **Ask before doing anything destructive.** Resetting or dropping the database, deleting migrations, or deleting user data all need explicit confirmation. `prisma migrate reset` refuses to run for AI agents without consent; never fake that consent.

## Backend architecture (model / service / controller)

All backend code lives in `inkwell/src/server/`, grouped by **feature module** (`auth`, `books`, `library`, and later `imports`, `journal`, `goals`). Inside each module, files are named by layer:

| Layer | Files | Responsibility | May import | Must not import |
|---|---|---|---|---|
| **Controller** | `<module>.controller.ts` (`"use server"` server actions), `src/app/api/**/route.ts` (HTTP handlers), `auth/auth.guard.ts` | Entry points. Authenticate (`requireUser` / `getRequestUser`), validate and parse raw input (FormData, JSON, params), call services, map `DomainError`s to form messages or HTTP statuses (`domainErrorResponse`), revalidate and redirect. No business rules and no database access. | services, guard, `next/*`, errors | models, `@/server/db` |
| **Service** | `<module>.service.ts` | Business logic and orchestration: enforces rules, combines models, owns transactions (`transaction()` from `@/server/db`), throws `DomainError`s. Framework-agnostic: no `next/*`, cookies or `Request`. Every function that touches user data takes `userId` first. | its own and other modules' models and services, rules, errors, external SDK adapters in `src/config/` | `next/*`, controllers, guards, the `prisma` client, `@/generated/prisma/client` (types via enums or models) |
| **Rules** (part of the service layer) | `<topic>.rules.ts`, plus pure helpers like `books/dedupe.ts` and `books/isbn.ts` | Pure functions with no I/O, for example status transitions. Unit-tested exhaustively. | enums, errors | anything with I/O |
| **Model** | `<entity>.model.ts` | Data access only: Prisma queries that return records. Every per-user query filters by `userId`. Each function takes an optional `db: Db = prisma` last argument so services can pass a transaction. Translates Prisma-specific errors into plain results (for example `createUserBook` returns `null` on a unique-key conflict). Inside a transaction, use `skipDuplicates` rather than catching a unique-key error, which would abort the transaction. | `@/server/db`, Prisma types and enums | services, controllers, `next/*` |

Other rules:

- **Pages** (Server Components) are presentation. They call `requireUser()` from the guard, then **services for reads**; every **mutation goes through a controller** (server action or route handler). Pages and client components never import models or `@/server/db`.
- **Anything exported from a `"use server"` file is a public endpoint.** Only put server actions in `*.controller.ts`, and make each one authenticate and validate. Shared request helpers belong in the guard, not in a controller.
- **Errors:** services throw subclasses of `DomainError` (`NotFoundError`, `ValidationError`, `UnauthorizedError`, or module-specific ones such as `InvalidTransitionError extends ValidationError`). Controllers catch `DomainError` and show its message; anything else is a bug and is rethrown.
- **A new feature** gets a folder in `src/server/<module>/` with `<entity>.model.ts`, `<module>.service.ts`, `<module>.controller.ts` (when it has mutations), `*.rules.ts` for pure logic. Its tests go in `src/server/tests/` (see "Directory layout" below), not in the module folder.
- **Biome enforces these boundaries** (the `noRestrictedImports` overrides in `inkwell/biome.json`). Don't disable those rules; restructure instead.

## Directory layout (rule)

Follow this arrangement for all backend code and tests:

```
inkwell/src/
├── app/                      # Next.js routes: pages, layouts, route handlers (controllers for HTTP)
├── components/               # Client components, in PascalCase (AddBookForm.tsx)
│   └── ui/                   # shadcn components: vendored, not linted, don't edit by hand
├── config/                   # Firebase client and Admin SDK setup
├── lib/utils.ts              # shadcn's cn helper
├── proxy.ts
├── generated/prisma/         # Prisma client (generated, gitignored)
└── server/
    ├── db.ts                 # Prisma singleton, Db/Tx types, transaction()
    ├── errors.ts             # DomainError and its subclasses
    ├── <module>/             # One folder per feature: auth, books, library, …
    │   ├── <entity>.model.ts
    │   ├── <module>.service.ts
    │   ├── <module>.controller.ts   # server actions, only when the module has mutations
    │   ├── <topic>.rules.ts         # pure logic
    │   ├── <name>.schema.ts         # zod input validation (never in a "use server" file)
    │   └── (auth only) auth.guard.ts
    └── tests/                # ALL backend tests, flat
        ├── <file-under-test>.test.ts   # e.g. library.service.test.ts, status.rules.test.ts
        └── stubs/                      # test-only module stand-ins (e.g. server-only.ts)
```

- **Every test file goes in `src/server/tests/`,** named after the file it tests (`<name>.test.ts`). Module folders contain no tests.
- **Tests import the code under test, and `vi.mock` it, through the `@/server/<module>/<file>` alias,** never by relative path. The alias resolves to the same file the service imports, so `vi.mock("@/server/library/library.model")` replaces it for `library.service.ts` too.
- Test-only stand-ins live in `src/server/tests/stubs/` and are wired up in `inkwell/vitest.config.ts`.

## Next.js 16 rules

- The `node_modules/next/dist/docs/` docs are authoritative; your training data is out of date. Read the relevant guide before writing Next-specific code (see `inkwell/AGENTS.md`).
- Use `proxy.ts`, never `middleware.ts`. The proxy only runs optimistic checks and never touches the database.
- `cookies()`, `headers()`, `params` and `searchParams` are async: always `await` them.
- Prefer Server Components, with Server Actions for mutations. Use `"use client"` only for interactivity.
- Put `import "server-only"` in any module that touches secrets, the Admin SDK, or the database from app code. **Exception:** `src/server/db.ts` must stay importable by the seed script, so don't add it there.

## Auth and data security rules

- **Every page, server action and route handler verifies the user itself.** Use `requireUser()` (pages and actions) or `getRequestUser(request)` (route handlers, which accept a Bearer API token or the session cookie), both from `src/server/auth/auth.guard.ts`. Never rely on the proxy for security.
- **Every query on per-user data filters by `userId`,** and service and model functions take `userId` as their first argument. Use `updateMany`/`deleteMany` with `{ id, userId }` so one user can't touch another's rows.
- **Shared catalog vs. per-user data:** `Book`, `Genre` and `Trope` are shared. Status, formats, sessions, reviews and goals belong in per-user tables (Phase 2b onward). Never put per-user state on `Book`.
- **Validate every input from the client or the extension** (types, lengths, ranges). Treat titles, authors and every other scraped field as untrusted.
- **Redirect targets** must be relative paths (see `safeRedirectPath` in `src/server/auth/auth.controller.ts`).
- **API tokens** are stored only as SHA-256 hashes and shown once. Never log or return them afterwards.
- **Regexes that run on untrusted text must not backtrack badly** (no `[^)]*\)`-style patterns that can rescan). SonarQube flags these.

## Secrets and environment

- Real values live in `inkwell/.env.local`; `inkwell/.env` holds only `DATABASE_URL`. **Never print, copy, or commit their values.** If you need to know what's configured, list the variable names only.
- Don't edit `.env.local`. Tell the user which variables to add, and document new ones with placeholders in `inkwell/.env.example`, which is the only env file that gets committed.
- `NEXT_PUBLIC_*` variables are shipped to the browser. Use the prefix only for genuinely public values (the Firebase web config). Server secrets (`FIREBASE_PRIVATE_KEY`, `DATABASE_URL`, and `ANTHROPIC_API_KEY` from Phase 5) must never have it.
- The Next dev server logs server-action arguments, including the sign-in ID token. Don't paste those logs anywhere public.

## Database and Prisma 7 rules

- The connection URL belongs in `prisma.config.ts`, not in `schema.prisma`. At runtime, `DATABASE_URL` (pooled on Neon) is used; migrations use `DIRECT_URL` when it's set.
- `PrismaClient` requires the driver adapter. The singleton lives in `@/server/db` and only models may use it; never call `new PrismaClient()` anywhere else.
- **Migrations are additive from now on.** Change `schema.prisma`, then create a new migration (`npx prisma migrate dev --name <change>`). If there's no interactive terminal, write `migration.sql` with `prisma migrate diff`. Never edit a migration that has already been applied.
- After a schema change, run `npx prisma generate`. The generated client lives in `src/generated/prisma` and is gitignored.
- The seed must stay idempotent (upsert by unique name). To run it: `npx prisma db seed`.
- Store dates as UTC; reading-log and goal dates are calendar dates.

## Code style and quality

- **Match the surrounding code:** TypeScript, two-space indentation, double quotes, named exports for helpers and default exports for pages and components. Mobile-first layouts.
- **UI uses shadcn (`base-nova`, on Base UI).** Use `src/components/ui/` rather than raw `<button>` and `<input>`, and theme tokens (`text-muted-foreground`, `border`) rather than colors like `zinc-500`. Add components with `npx shadcn add <name>`.
- **Base UI checkboxes keep their own state,** so React's automatic form reset doesn't clear them. See how `AddBookForm` remounts the form.
- **Comments are sparse and explain *why*,** not what.
- **Keep pure logic in `*.rules.ts` (or pure helpers like `dedupe.ts`)** so it can be unit-tested without Prisma. Tests follow the "Directory layout" section above: rules are tested directly, services with their model mocked (`vi.mock("@/server/<module>/<entity>.model")`), and models with a recording fake of Prisma that asserts every query is scoped by `userId`.
- **The user runs SonarQube/SonarLint.** Write code that passes the "Sonar way" profile:
  - Mark component props `Readonly<…>`.
  - No non-null assertions (`!`).
  - Use `replaceAll` rather than `replace` with a `/g` regex.
  - Use `String.raw` for backslash-heavy strings, except in the proxy `matcher`, which must be a plain string literal.
  - Use `globalThis` rather than `window`.
  - Use top-level `await` rather than `.then` chains in scripts.
  - Use a single boolean `return` rather than `if (x) return true; return false`.
  - Avoid super-linear regexes.
- **Biome is the linter** (`npm run lint` runs `biome lint`, config in `inkwell/biome.json`). There is no ESLint in this project. Biome's formatter is turned off for now, so don't reformat files in bulk.
- **`inkwell/package.json` has `"type": "module"`,** so scripts are ESM.

## Dependencies

- Use npm, run from `inkwell/`. npm here blocks dependency install scripts; `prisma generate` runs from the package's own `postinstall` and `build` scripts.
- **Don't remove the `overrides` in `package.json`.** They patch vulnerable transitive dependencies that upstream hasn't fixed yet. Re-check them with `npm audit` when upgrading.
- `npm audit` reports 6 low or moderate findings, all through the `shadcn` package (`deepmerge`, `minimatch` via `ts-morph`). Anything else is new and needs looking at. Never run `npm audit fix --force` without asking: it can silently downgrade packages (it once replaced ESLint 9 with 4.0.0 and broke linting).
- zod is approved for input validation (Phase 3).
- `barcode-detector` (on `zxing-wasm`) is approved for barcode scanning (Phase 4d); load it only where the browser lacks `BarcodeDetector`.
- Ask before adding significant dependencies, and pin to an exact or caret version of a release at least two weeks old.

## Domain rules (keep these consistent)

- **Dedupe order:** ASIN → ISBN-13 (convert ISBN-10 with `toIsbn13`) → `dedupeKey`, which is the normalized title plus every author's surname, sorted so author order doesn't matter. Re-importing a book only ever adds a format; it never overwrites a user's status, dates or list order.
- **Genres and tropes** come only from the curated lists in `assets/lists/`. The AI picks from these lists; `source: AI | USER` records who attached each one, and AI updates must never overwrite `USER` rows.
- **Goal progress** is always computed, never stored.
- **A reader's own details override the catalog's:** `UserBook.pageCount`, `authors` and `coverUrl` hold what a reader edited, and empty means the catalog's value is used. Show the reader's value first; dedupe only ever uses `Book`.
- **Private books:** a `Book` with `ownerId` set (a personal document from Amazon's Docs tab) belongs to that user alone. Any lookup that matches books for a library must exclude other users' private books, and they must not be sent to the AI enrichment in Phase 5 without asking the user.
- **There are five lists, and the list is the status:** Wishlist, TBR, Reading, Finished and DNF are views of `UserBook.status`. Don't store lists separately.
- **Formats are a detail of the book, not a list:** `UserBook.formats` holds any of ebook, physical and audiobook, and empty means not owned. A `WISHLIST` book becomes `TO_READ` as soon as it gets a format, and a `TO_READ` book with no formats left becomes `WISHLIST`. Other statuses don't change.
- **A book can be read more than once** (`ReadThrough`, Phase 3a), and earlier reads are never erased. Read dates are optional: a bulk move records none rather than inventing them.
- **AI** uses the Claude API from server-only code (Phase 5). Enrichment runs once per catalog `Book`, and Message Batches are used for large imports.
