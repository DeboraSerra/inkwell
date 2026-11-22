# Phase 6 — CI, code quality and missing tests

[← Plan overview](README.md)

🚧 In progress: 6a–6e ✅ done (2026-11-22); 6i, 6j, 6n, 6p, 6l, 6f, 6h and 6k ✅ built; 6o planned. Asked by the user on 2026-11-22, to come before Phase 10. The missing tests come first (asked by the user on 2026-11-22), so coverage starts from a fuller suite.

Phase 11 already listed GitHub Actions, `npm audit` in CI and Dependabot; they move here, and Phase 11 keeps Playwright, the remaining zod and rate-limit checks, and the deploy.

**Applies to every step**

- **The app lives in `inkwell/`, git at the repo root.** Every workflow step runs with `working-directory: inkwell`, and husky is set up from the root (`.husky/` at the root, `prepare` in `inkwell/package.json` running `cd .. && husky`).
- **New dev dependencies need approval** (open question 1), each pinned to a release at least two weeks old.
- **Node 26,** as `engines` says (`26.x` since 2026-11-22, when Vercel made Node 26 LTS generally available; it was 24). `.nvmrc`, CI and Vercel all use it.
- **Secrets never reach CI logs.** The build gets placeholder values for the `NEXT_PUBLIC_*` and server variables; no real key is stored in GitHub except where a step truly needs it (none here).
- Each step ends with `npx tsc --noEmit`, `npm run lint` and `npm test` passing locally, and the workflow passing on a pushed branch.

## 6a — Missing tests ✅ built (2026-11-22)

Measured on 2026-11-22: these files have no test of their own.

- **Server:**
  - `auth/auth.controller.ts` (sign-in/out and API-token actions, `safeRedirectPath`),
  - `auth/api-token.model.ts`, `auth/user.model.ts`, `rate-limit/rate-limit.model.ts`, `library/read-through.model.ts` (only partly covered through `library.model.test.ts`): recording-fake tests that every query is scoped by `userId`, as AGENTS.md asks,
  - `auth/auth.guard.ts`: `getRequestUser` (Bearer token, cookie, neither) and `requireUser`,
  - `metadata/http.ts` (timeout, size cap, cache, `ProviderError`),
  - `enrichment/enrichment.schema.ts`,
  - `errors.ts` (`domainErrorResponse` statuses),
  - `app/api/me/route.ts`.
- **Client logic** (no DOM needed): `components/pages/books/new/isbn-input.ts`, `barcode-scan.ts` (with `BarcodeDetector` stubbed), `hooks/useBookActions.ts` and `components/pages/context` (only with a React test setup, see below).
- **Components:** no React component has a test. Testing them needs `@testing-library/react`, `@testing-library/user-event` and `jsdom` (open question 4). If approved, start with the riskiest: `AddBookForm` (edit vs add, locked fields, topics), `TopicFilter`, `ShelfFilterBar` (search, ✕, hidden fields), `TapTooltip`, `BookCard` pills.
- Tests follow the layout rules: server tests in `src/server/tests/<module>/`, component tests in `src/components/tests/<folder>/`.

**Done when:** every file above has a test. Coverage isn't measured yet; 6b sets its thresholds from the numbers these tests reach.

### Outcome

Every file above has a test, run and committed one set at a time. The suite went from 1,162 to 1,339 tests.

- **Server:** `tests/errors.test.ts` (at the tests root, as `errors.ts` is at the server root), `enrichment/enrichment.schema.test.ts`, `auth/auth.guard.test.ts` (extended with `getRequestUser`, `requireUser` and the session cookie), `auth/auth.controller.test.ts` (`safeRedirectPath` through `signIn`), `auth/me.route.test.ts`, `auth/api-token.model.test.ts`, `auth/user.model.test.ts`, `rate-limit/rate-limit.model.test.ts`, `library/read-through.model.test.ts`, `metadata/http.test.ts`.
- **Client logic:** `components/tests/pages/books/new/isbn-input.test.ts` and `barcode-scan.test.ts`.
- **React (question 4 approved):** dev dependencies `jsdom` 31.0.0, `@testing-library/react` 16.3.3, `@testing-library/user-event` 14.6.8 and `@testing-library/dom` 10.4.2 (Testing Library's peer dependency), pinned exactly. `npm audit` still shows only the 4 moderate `shadcn` findings.
  - `vitest.config.ts` has two projects: `node` (`*.test.ts`) and `dom` (`*.test.tsx`, jsdom, `components/tests/setup.ts`, which unmounts after each test and stubs `ResizeObserver`).
  - Tests: `components/tests/hooks/useBookActions.test.tsx` (`src/hooks` has no components folder, so its tests sit in `components/tests/hooks/`), `pages/context/context.test.tsx`, `pages/books/new/AddBookForm.test.tsx`, `pages/books/shelves/BookShelf/TopicFilter/TopicFilter.test.tsx`, `pages/books/shelves/BookShelf/ShelfFilterBar.test.tsx`, `common/TapTooltip.test.tsx` and `pages/books/shelves/BookCard/BookCard.test.tsx`.
  - `ShelfFilterBar`'s tests fake only `setTimeout` and use `fireEvent`: Testing Library's async helpers wait on a real timer, so `user-event` hangs under fake timers.
- **Fixed after review:** `CardPill` put each word in its own `<small>` with no space between them, so the text and accessible name read "WarCollege" and "Tag:Dragons". The pill's text is now one `<small>`, which wraps between words like any text, and there's a space after the screen-reader label. `wordsWithPositions` and the `PositionedWord` type are removed. `BookCard.test.tsx` checks the names.

**The remaining components (asked by the user on 2026-11-22).** Every other component and hook now has a test too, in six more commits; the suite has 1,555 tests.

- **Shelves:** `BooksPagination`, `BooksPerPageSelect`, `ShelfOrderControls`, `ShelfSelection`, `SelectedBooksBar`, `FilterList`, `BookDialog`, `MoveBookDialog`, `EditBookDialog`, `BookCardMenu`, `BooksShelf`, `BooksShelves`, `topics-context`, `BookTitle`, `CardPill`, `formats`. Shared stand-ins are in `components/tests/pages/books/shelves/shelf-fixtures.ts`.
- **Add form:** `TextField`, `PartialDateField`, `AudioLengthField`, `StatusField`, `FormatsField`, `TopicsField`, `BookPreview`, `ScanBarcodeButton`, `IsbnLookupField`, `TitleSearchField`, `LiveScanButton`, `BookCover`, `BooksNew`.
- **Sign-in and settings:** `EmailSignInForm`, `GoogleSignInButton`, `Login`, `CreateTokenForm`, `Tokens`, `Profile`, `Settings`. The async Server Components are awaited, then rendered.
- **Layout:** `MobileTabBar`, `AppSidebar`, `Content`, `Footer`, `AccountMenuContent`, `SidebarLink`, `SignOutItem`, and `hooks/use-mobile`. `components/tests/setup.ts` now also stubs `matchMedia`.
- **Not tested:** `components/layout/Header.tsx`, which nothing imported (deleted in 6b), and `src/config/` (`firebase-session.ts` is covered only through the sign-in forms' mocks).
- **Found, not changed:**
  - Pagination links are real `<a href>`s, but the vendored `ui/pagination.tsx` (Base UI `Button` with `nativeButton={false}`) gives them `role="button"`, so screen readers announce them as buttons.
  - `Header.tsx` was unused, and passed `as={Link}` to Base UI's `Button`, which has no `as` prop. Deleted in 6b.

## 6b — Test coverage ✅ built (2026-11-22)

- **Dependency:** `@vitest/coverage-v8`, the same major as `vitest` 5.
- **`npm run test:coverage`** (`vitest run --coverage`), with coverage of `src/server/**`, `src/components/**/*.{ts,tsx}` and `src/hooks/**`, excluding `src/generated`, `src/components/ui`, `src/server/tests` and `*.type.ts(x)`.
- **Thresholds** at 95% for statements, branches, functions and lines (asked by the user on 2026-11-22).
- **Reports:** text summary in the terminal, `lcov` for CI (and Sonar, if g is chosen); `coverage/` is gitignored.

**Done when:** `npm run test:coverage` prints the summary and fails when a threshold isn't met.

### Outcome

- `@vitest/coverage-v8` 5.0.3 (2026-09-30), pinned exactly, the same version as `vitest`. `npm audit` still shows only the 4 moderate `shadcn` findings.
- `npm run test:coverage` runs `vitest run --coverage`. The settings are in `vitest.config.ts`, at the top level so they cover both test projects: `src/server/**`, `src/components/**/*.{ts,tsx}` and `src/hooks/**`, without `src/generated`, `src/components/ui`, both test folders and `*.type.ts(x)`.
- Measured on 2026-11-22, with components and hooks: statements 97.13%, branches 93.48%, functions 96.01%, lines 97.49%. Branches were low mostly from models' default `db` argument never being passed, controller actions never tested with an unexpected error, and service fallbacks. Three more 6a commits cover those (models with a passed-in transaction, every library action's rethrow, and the book service's ISBN-10, race and topic paths), bringing it to statements 98.35%, branches 95.65%, functions 97.88%, lines 98.78% (1,604 tests).
- The thresholds are 95 for each. A run with a threshold above the numbers fails (exit 1).
- Reports: the files not fully covered and the totals in the terminal, and `coverage/lcov.info` for CI. `coverage/` was already in `inkwell/.gitignore`. Biome now skips `coverage/` too (`biome.json`), since the HTML report's scripts gave 299 lint errors.
- The `.tsx` components and `src/hooks/` are counted too (asked by the user on 2026-11-22). The unused `components/layout/Header.tsx`, the only file at 0%, is deleted.

## 6c — Commit messages: husky and commitlint ✅ built (2026-11-22)

- **Dependencies:** `husky`, `@commitlint/cli`, `@commitlint/config-conventional`.
- **`commitlint.config.mjs`** at the root: conventional commits, `header-max-length` 100 (the length used for this project's commit messages), types `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `build`, `ci`, `perf`, `revert`.
- **Hooks:**
  - `commit-msg`: `npx --no -- commitlint --edit "$1"`.
  - `pre-commit`: fast checks only, on staged files: Biome lint (`biome lint --staged` or `lint-staged`, open question 2). Not the full test run, so committing stays quick.
  - `pre-push` (optional, open question 3): `tsc` and `npm test`.
- Hooks are a convenience; CI (6d) is what enforces.

**Done when:** a commit with a message like "updated stuff" is rejected, `feat(books): …` passes, and a staged file with a lint error stops the commit.

### Outcome

- **Dev dependencies** (approved 2026-11-22), pinned exactly: `husky` 9.1.7, `@commitlint/cli` 21.2.4 and `@commitlint/config-conventional` 21.2.4 (2026-10-18). `npm audit` still shows only the 4 moderate `shadcn` findings.
- **`prepare`** in `inkwell/package.json` runs `cd .. && husky`, which sets `core.hooksPath` to `.husky/_` at the repo root.
- **`.husky/commit-msg`** runs commitlint from `inkwell/`, turning Git's root-relative message path into an absolute one. **`.husky/pre-commit`** runs `biome lint --staged --no-errors-on-unmatched`. No `pre-push` hook (open question 3: left to CI).
- **Deviation:** `commitlint.config.mjs` is in `inkwell/`, not at the root, so `extends` resolves from `inkwell/node_modules` (the root has none).
- **`biome.json`** has `vcs` enabled (`clientKind: git`, `root: ".."`), which `--staged` needs. `useIgnoreFile` stays off, so `npm run lint` checks the same files as before.
- **Checked:** "updated stuff", "Feat: Bad Case" and a 107-character header are rejected; `feat(books): add a thing` passes; a staged file with `debugger` stops the commit (staged through a temporary index, so nothing was staged); nothing staged passes.
- **For the user:** anyone cloning runs `npm install` in `inkwell/` to set up the hooks. `HUSKY=0` skips them. The 2 lint warnings already in the code (`BookCover.tsx` `noImgElement`, `BookPreview.tsx` an unused variable) are warnings, so they don't stop a commit.

## 6d — CI on GitHub Actions ✅ built (2026-11-22)

`.github/workflows/ci.yml`, on every pull request and on pushes to `main` and `dev`:

1. **Setup:** checkout, Node 26 (24 when built) with npm cache, `npm ci` (in `inkwell/`).
2. **Checks:** `npx tsc --noEmit`, `npm run lint`, `npm run test:coverage`. Coverage goes to the job summary and as an artifact.
3. **Build:** `npm run build` with placeholder environment variables, so a change that only breaks the build is caught before Vercel.
4. **Migrations:** a Postgres service container; `npx prisma migrate deploy` on the empty database, then `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`, which fails when `schema.prisma` changed without a migration. The seed runs too, so a broken seed or curated list is caught.
5. **Audit:** `npm audit --audit-level=high` (today's 4 moderate `shadcn` findings don't fail it).
6. **Commit messages:** commitlint over the pull request's commits (`--from base --to head`).
7. **Extension:** `node extension/build.mjs https://example.com` builds, so the store package can't break unnoticed.

- Jobs run in parallel where they can (checks, build, migrations), with `concurrency` cancelling a superseded run on the same branch.
- Actions are pinned to a full commit SHA, not a tag, and the workflow has `permissions: contents: read`.

**Done when:** a pull request shows each check, and a failing test, type error, lint error, broken build, missing migration, high audit finding or bad commit message turns it red.

### Outcome

- **`.github/workflows/ci.yml`**, six jobs in parallel: `checks` (types, lint, tests with coverage), `build`, `migrations` (Postgres 17 service, `migrate deploy`, `migrate diff --exit-code`, seed), `audit`, `commitlint` (pull requests only, `fetch-depth: 0`, base and head SHAs passed through `env`) and `extension`.
- **Pinned by commit SHA,** each release over two weeks old: `actions/checkout` v7.0.1, `actions/setup-node` v7.1.0, `actions/upload-artifact` v7.0.2. `permissions: contents: read`, `concurrency` cancels a superseded run, and `HUSKY=0` skips the `prepare` hook setup.
- **Coverage:** the totals go to the job summary, and `coverage/` (with `lcov`) plus the full output to a `coverage` artifact kept 14 days.
- **Build placeholders:** the `NEXT_PUBLIC_FIREBASE_*` values, `FIREBASE_PROJECT_ID`, `DATABASE_URL`, `ANTHROPIC_API_KEY` and `CRON_SECRET`. `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` are left out, since `cert()` would try to parse a fake key; the Admin SDK only warns. No GitHub secrets are needed.
- **Checked locally:** coverage passes and the summary extract works; `npm audit --audit-level=high` passes; commitlint passes on the commits since `46c3eb2`; the extension builds; on a throwaway Postgres 17 container, every migration applied, the diff found no difference, and the seed ran.
- **Checked on GitHub** by the user on 2026-11-22: every job passed, `build` included.
- **For the user:** push a branch and open a pull request to see the checks; then 6e (branch protection) can require them.

## 6e — Repository settings ✅ set (2026-11-22), the push check left to the user

- **Branch protection on `main`:** pull requests only, the CI checks required, no force pushes.
- **Secret scanning and push protection** turned on.
- **Dependabot alerts** on.

**Done when:** a direct push to `main` is refused and a PR can't merge with a red check.

### Outcome

Set through `gh api` on 2026-11-22 (the repository is public, so every feature is free):

- **Ruleset `main`** (id 27861611, active, default branch, no bypass): restrict deletions, block force pushes, pull request required (0 approvals), and the six CI checks required from GitHub Actions: `Types, lint and tests`, `Build`, `Migrations and seed`, `npm audit`, `Commit messages`, `Extension package`. Branches don't have to be up to date before merging.
- **Secret scanning and push protection** were already on.
- **Dependabot alerts** turned on. Security and version updates stay off (suggestion f).
- `Commit messages` only runs on pull requests; on a push run it's skipped, which GitHub counts as passing.
- **For the user:** check that a direct `git push origin main` is refused. Not tried here, to avoid pushing.

## Additions chosen by the user (2026-11-22)

From the suggestions f–p: f, h, i, j, k, n, o and p are steps of this phase, keeping their letters. g (SonarQube Cloud) moved to [Phase 14](phase-14-subscriptions.md), to apply if subscriptions are enabled. l (gitleaks) was dropped, then added back on 2026-11-22 as a `pre-commit` hook only (6l): push protection and GitGuardian only act at or after the push, and gitleaks stops a secret before it's committed. m (security headers) moved to Phase 14 as well. One step at a time, in the order below.

## 6i — `.nvmrc` and the stray root lockfile ✅ built (2026-11-22)

- `.nvmrc` at the repo root with `24`, matching `engines`, CI and Vercel.
- Delete the `package-lock.json` at the repo root, which the build warns about (the repo root has no `package.json`).

**Done when:** `nvm use` picks Node 26 and `npm run build` no longer warns about multiple lockfiles.

### Outcome

- `.nvmrc` at the repo root holds `26` (first `24`; switched the same day, see below). nvm looks upward, so it applies in `inkwell/` and `extension/` too.
- **No stray lockfile left:** there's no `package-lock.json` at the repo root or in any folder above it; `inkwell/package-lock.json` is the only one. Nothing to delete.
- **Switched to Node 26** on 2026-11-22 (asked by the user): Vercel now offers 26 LTS for builds and functions, and the machine already ran it. `engines` is `26.x`, `.nvmrc` `26`, every `node-version` in `ci.yml` `26`, and `@types/node` `^26.6.6` (2026-10-28; was `^24.19.2`). `tsc`, lint and the 1,604 tests pass; `npm audit` still shows only the 4 moderate `shadcn` findings.
- **For the user:** the next CI run and a Vercel preview deploy confirm Node 26 there. Whether the build's lockfile warning is gone shows on the next `npm run build`.

## 6j — Pull request template ✅ built (2026-11-22)

- `.github/pull_request_template.md`: what changed and which plan step, then boxes for the plan updated, `tsc` / lint / tests passing, checked in the app, and `/privacy` updated when what's collected changed.

**Done when:** a new pull request opens with the template filled in.

### Outcome

- `.github/pull_request_template.md`: "What changed" (with the plan step), then boxes for the plan updated, `tsc` / lint / tests / build passing, checked in the app, `/privacy`, new variables in `.env.example` and on Vercel, and a schema change's migration with row-level security.
- **For the user:** the next pull request shows it.

## 6n — `npm audit signatures` in CI ✅ built (2026-11-22)

- One step in the `audit` job after `npm ci`, which that job then needs: `npm audit signatures`, failing on a missing or invalid registry signature.

**Done when:** the `audit` job runs it and passes.

### Outcome

- The `audit` job now runs `npm ci --ignore-scripts` (with the npm cache; scripts aren't needed to check signatures) and then `npm audit signatures`, after `npm audit --audit-level=high`.
- **Checked locally:** every installed package has a valid registry signature, and 202 also have verified attestations; it exits 0.
- **For the user:** the next CI run shows it in the `npm audit` job.

## 6p — Every endpoint authenticates (test) ✅ built (2026-11-22)

- `src/server/tests/auth/endpoints-auth.test.ts`: lists every `src/app/**/route.ts` and every `*.controller.ts`, and fails on an exported handler or action whose file doesn't call `requireUser`, `getRequestUser` or `isCronRequest`. A short allowlist for endpoints that are public on purpose (sign-in), each with a reason.

**Done when:** the test passes today, and fails when a new route or action without a check is added.

### Outcome

- `src/server/tests/auth/endpoints-auth.test.ts` parses the source with the TypeScript compiler (already a dev dependency) rather than matching text: every exported HTTP method in `src/app/**/route.ts`, and every export of any file starting with `"use server"` (found anywhere under `src/`, not only `*.controller.ts`), must **call** `requireUser`, `getRequestUser` or `isCronRequest` in its own body. Checked per function, not per file, so one guarded action can't cover an open one beside it.
- **Public on purpose:** `signIn` (it's how a visitor gets a session; Firebase verifies the ID token) and `signOut` (only clears the caller's cookie), each with its reason in the test. The test also fails if one of those gets a check or disappears, so the list can't go stale.
- **Also checked:** `"use server"` files are only `*.controller.ts`, as AGENTS.md requires.
- Unit tests of the checker itself: an unguarded export is flagged, a guard in an arrow function counts, a guard only mentioned and not called doesn't, and unexported helpers and non-method exports (`maxDuration`) are ignored.
- **Checked:** it passes on the 4 routes and 2 controllers today; a temporary `app/api/zz-tmp/route.ts` without a check made it fail with `app/api/zz-tmp/route.ts#GET`, and was removed.

## 6l — gitleaks before each commit ✅ built (2026-11-22)

- **Why:** GitHub's push protection refuses known provider keys only at the push, with the secret already in a local commit, and GitGuardian only reports after it. gitleaks checks the staged files before the commit exists, and its generic and entropy rules also catch what push protection doesn't (a `DATABASE_URL` with a password, `CRON_SECRET`, a key pasted into a test or script).
- **Install:** `brew install gitleaks` on each machine that commits (a Go binary, not an npm dependency; free, MIT). No CI job.
- **`.husky/pre-commit`** runs `gitleaks git --staged --redact --no-banner` from the repo root before Biome. When `gitleaks` isn't installed, it prints a warning and skips, so it never blocks a commit.
- **`.gitleaks.toml`** at the root: extends the default rules, with an allowlist for `inkwell/.env.example`'s placeholders, the test fixtures in `src/server/tests/fixtures/` and anything else a first full scan (`gitleaks git`) flags falsely, each with a reason.
- The first full scan of the history also shows whether a secret was ever committed. If one was, rotate it; rewriting history is the user's call.

**Done when:** committing a staged file with a fake key is refused, `.env.example` commits cleanly, and the commit still goes through (with a warning) on a machine without gitleaks.

### Outcome

- **`.husky/pre-commit`** runs `gitleaks git --staged --redact --no-banner` from the repo root, then Biome. Without `gitleaks` on the `PATH` it prints a warning and goes on.
- **`.gitleaks.toml`** at the root: the default rules, with `inkwell/.env.example` and `inkwell/src/server/tests/fixtures/` allowed. Tests themselves stay scanned; fake keys in them get allowed one by one after the first full scan, if it flags any.
- **History scan** (gitleaks 8.30.1, 134 commits): 2 findings, both the Firebase web API key in the extension's old `extention/firebase-project/` (commit `b81864e`, removed in `61d84b1`). It's the same key the app ships to browsers as `NEXT_PUBLIC_FIREBASE_API_KEY`, public by design, so nothing to rotate. Both are in `.gitleaksignore` by fingerprint, with that reason; a full scan now finds no leaks.
- **The hook exits on a finding** (`|| exit 1`), not only under husky's `sh -e`.
- **Checked:** a staged file with a fake GitHub token is refused ("leaks found: 1"); `.env.example`, the hook and the config files pass; without gitleaks the hook warns and passes.
- **For the user:** the Firebase web key should be restricted in Google Cloud (HTTP referrers to the app's domains, and only the Firebase APIs), as every public web key should. It's a setting, not a leak.

## 6f — Dependabot updates ✅ built (2026-11-22), first run on GitHub to check

- `.github/dependabot.yml`: `npm` in `/inkwell` and `github-actions` in `/`, weekly, minor and patch updates grouped into one PR per ecosystem, majors on their own.
- `cooldown: default-days: 14`, so no PR proposes a release younger than the project's two-week rule.
- The `overrides` and exact pins in `package.json` stay the user's call; Dependabot PRs go through CI and are never merged unreviewed.

**Done when:** Dependabot's first run opens grouped PRs (or none, when everything is current), and none for a release under 14 days old.

### Outcome

- `.github/dependabot.yml`: `npm` in `/inkwell` and `github-actions` in `/`, weekly on Mondays, `cooldown: default-days: 14`. npm minor and patch updates share one grouped PR (`npm-minor-patch`), majors come one by one; actions are one grouped PR. Actions stay pinned by SHA, with Dependabot updating the SHA and its version comment.
- **Deviation:** PRs target `dev`, the working branch, not `main`, so they reach `main` through the usual `dev` PR.
- **Commit messages:** prefixes `build(deps)` / `build(deps-dev)` for npm and `ci` for actions, so they're conventional commits. `commitlint.config.mjs` ignores commits signed off by `dependabot[bot]`, whose bodies have lines over 100 characters (release notes, links). Checked: such a message passes, and an ordinary one with a 150-character body line still fails.
- **For the user:** the first run comes after the push to the default branch, under Insights → Dependency graph → Dependabot; it can also be started there with "Check for updates".

## 6h — Knip ✅ built (2026-11-22)

- **Dependency:** `knip`, a dev dependency, pinned to a release at least two weeks old.
- `knip.json` in `inkwell/` with the Next.js, Vitest and Prisma entry points (`prisma/seed.ts`, `prisma/*.ts` scripts, `scripts/*.mjs`), ignoring `src/components/ui/` and `src/generated/`.
- A `knip` script, run in CI's `checks` job.
- Fix what it finds: `zod` becomes a direct dependency (already approved); unused files and exports are removed or, when kept on purpose, listed with a reason.

**Done when:** `npx knip` passes locally and in CI.

### Outcome

- **Dependencies:** `knip` 6.44.2 (2026-11-07), exact; `zod` `^4.6.7` as a direct dependency, the version already installed through `@anthropic-ai/sdk` and `shadcn`. `npm audit` unchanged.
- **`inkwell/knip.jsonc`:** the one-off scripts in `prisma/` and `scripts/` as entries; CSS and `schema.prisma` in the project, so Tailwind's imports and the generated client are followed; `src/components/ui/` ignored. Ignored dependencies, each with its reason: `@prisma/client` (generated client), `pg` and `@types/pg` (the adapter's driver), `@commitlint/cli` (run from `.husky/` at the root), `zxing-wasm` (must stay the copy `barcode-detector` resolves).
- **`npm run knip`**, and a step in CI's `checks` job after lint.
- **Fixed:** 19 exports only used in their own file are no longer exported (constants such as `SESSION_COOKIE`, `MIN_QUERY_LENGTH`, `RATE_LIMIT_WINDOW_SECONDS`, and `readerDetails`, `uniqueFormats`, `defaultSortFor`, `mergeDocPair`, `CatalogRecord`…). Removed as unused: `library.service.getUserBook`, the `EnrichmentReply` type and `config/firebase.ts`'s default export.
- **Checked:** `npm run knip` passes; `tsc`, lint and the 1,612 tests (coverage thresholds included) pass.

## 6k — CodeQL ✅ set up (2026-11-22), the fix to be confirmed by the next analysis

- GitHub's default setup for JavaScript/TypeScript and GitHub Actions, turned on through `gh api` (no workflow file). Free on a public repository.
- Findings appear under Security → Code scanning; any found on the first run are triaged here.

**Done when:** the first analysis finishes, and findings are fixed or dismissed with a reason.

### Outcome

- **Default setup** turned on through `gh api` (`PATCH …/code-scanning/default-setup`): JavaScript/TypeScript, the default query suite, weekly and on every push and pull request. The first analysis (run 45080503685, on `main`) succeeded.
- **GitHub Actions not scanned yet:** GitHub refused `actions` as a language ("not present in the repository"), since the workflows aren't on `main`. Add it once they are: `gh api -X PATCH repos/DeboraSerra/inkwell/code-scanning/default-setup -f state=configured -f 'languages[]=javascript-typescript' -f 'languages[]=actions'`.
- **One finding, high:** alert 1, `js/xss-through-dom` at `BookCover.tsx:86`. The add form's cover field shows what's typed as the cover at once, and that text went straight into a plain `<img src>`. Browsers don't run a `javascript:` URL in an image, but the server only ever saves https covers (`isHttpsUrl`), so the preview now does the same: `BookCover` parses the URL, shows the placeholder unless it's `https:`, and gives the plain `<img>` the parsed `url.href`. A typed `http:`, `javascript:` or `data:` URL, or text that isn't a URL, now shows the placeholder (before: a broken plain image). Tests updated; all 1,614 pass with coverage.
- **For the user:** after the push, the next analysis should close alert 1. If it doesn't, dismiss it as "False positive" with that reason.

## 6o — OpenSSF Scorecard ⏳ planned

- `.github/workflows/scorecard.yml`: weekly and on pushes to `main`, using `ossf/scorecard-action` pinned by SHA, with the permissions it needs (`security-events: write`, `id-token: write`) on that job only. Results go to code scanning.
- It reports, never blocks. Checks that don't fit a one-person repository (code review by a second person, a fuzzing setup) are noted rather than chased.

**Done when:** the first run publishes a score and its findings are listed in this step's outcome.

## Open questions

1. ~~**Approve the dev dependencies** for 6b–6c~~ Approved on 2026-11-22.
2. ~~**Pre-commit lint**~~ Decided 2026-11-22: Biome's own `--staged`.
3. ~~**Pre-push hook**~~ Decided 2026-11-22: none; CI enforces.
4. ~~**React component tests** in 6a~~ Approved: `@testing-library/react`, `@testing-library/user-event` and `jsdom` are in use.
5. ~~**Which of f–p**~~ Decided 2026-11-22: f, h, i, j, k, n, o, p; g and m to Phase 14; l as a `pre-commit` hook only.
6. **Phase numbering:** answered on 2026-11-22: renamed to Phase 6, and the later phases renumbered (shelf filter fixes 7, dashboard 8, profile 9, journal 10, quality and deploy 11, mobile API 12, mobile app 13, subscriptions 14).
