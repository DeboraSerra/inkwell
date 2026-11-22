# Phase 6 — CI, code quality and missing tests

[← Plan overview](README.md)

🚧 In progress: 6a, 6b and 6c ✅ built (2026-11-22); 6d and 6e wait on the open questions. Asked by the user on 2026-11-22, to come before Phase 10. The missing tests come first (asked by the user on 2026-11-22), so coverage starts from a fuller suite.

Phase 11 already listed GitHub Actions, `npm audit` in CI and Dependabot; they move here, and Phase 11 keeps Playwright, the remaining zod and rate-limit checks, and the deploy.

**Applies to every step**

- **The app lives in `inkwell/`, git at the repo root.** Every workflow step runs with `working-directory: inkwell`, and husky is set up from the root (`.husky/` at the root, `prepare` in `inkwell/package.json` running `cd .. && husky`).
- **New dev dependencies need approval** (open question 1), each pinned to a release at least two weeks old.
- **Node 24,** as `engines` says. The local machine runs Node 26, so CI and `.nvmrc` pin 24 to match Vercel.
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

## 6d — CI on GitHub Actions

`.github/workflows/ci.yml`, on every pull request and on pushes to `main` and `dev`:

1. **Setup:** checkout, Node 24 with npm cache, `npm ci` (in `inkwell/`).
2. **Checks:** `npx tsc --noEmit`, `npm run lint`, `npm run test:coverage`. Coverage goes to the job summary and as an artifact.
3. **Build:** `npm run build` with placeholder environment variables, so a change that only breaks the build is caught before Vercel.
4. **Migrations:** a Postgres service container; `npx prisma migrate deploy` on the empty database, then `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`, which fails when `schema.prisma` changed without a migration. The seed runs too, so a broken seed or curated list is caught.
5. **Audit:** `npm audit --audit-level=high` (today's 4 moderate `shadcn` findings don't fail it).
6. **Commit messages:** commitlint over the pull request's commits (`--from base --to head`).
7. **Extension:** `node extension/build.mjs https://example.com` builds, so the store package can't break unnoticed.

- Jobs run in parallel where they can (checks, build, migrations), with `concurrency` cancelling a superseded run on the same branch.
- Actions are pinned to a full commit SHA, not a tag, and the workflow has `permissions: contents: read`.

**Done when:** a pull request shows each check, and a failing test, type error, lint error, broken build, missing migration, high audit finding or bad commit message turns it red.

## 6e — Repository settings (the user does these on GitHub)

- **Branch protection on `main`:** pull requests only, the CI checks required, no force pushes.
- **Secret scanning and push protection** turned on.
- **Dependabot alerts** on.

**Done when:** a direct push to `main` is refused and a PR can't merge with a red check.

## Suggested additions (open question 5: pick any)

**Code quality**

- **f. Dependabot updates** (`.github/dependabot.yml`): npm in `inkwell/` and GitHub Actions, weekly, grouped, with `cooldown: default-days: 14` so it never proposes a release younger than the project's two-week rule.
- **g. SonarQube Cloud in CI:** you already use SonarLint; the CI scan adds the quality gate on each PR and imports the `lcov` coverage. Needs a free SonarCloud project and a `SONAR_TOKEN` secret.
- **h. Knip** (`knip`): finds unused files, exports and dependencies, and dependencies used but not listed. Today it would flag `zod` (imported but only installed through `shadcn`), which should become a direct dependency either way.
- **i. `.nvmrc`** with 24, and removing the stray `package-lock.json` at the repo root (the build warns about it).
- **j. A pull request template** with the "Done when" checklist and "checked in the app" boxes.

**Security**

- **k. CodeQL** code scanning for JavaScript/TypeScript (GitHub's default setup, no workflow to maintain).
- **l. gitleaks** in CI (and optionally in `pre-commit`), to stop a committed key even before GitHub's push protection.
- **m. Security headers** in `next.config.ts`: `Content-Security-Policy` (scripts from self, images from the two cover hosts, connections to Firebase), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera only for the barcode scanner), and `frame-ancestors 'none'`. The CSP needs testing against Firebase sign-in.
- **n. `npm audit signatures`** in CI, to check packages' registry signatures and provenance.
- **o. OpenSSF Scorecard** action: a weekly score of the repo's security practices (pinned actions, branch protection, token permissions).
- **p. A test that every route handler and server action authenticates:** it lists the files and fails on one that doesn't call `requireUser`, `getRequestUser` or `isCronRequest`, so a new endpoint can't ship open.

## Open questions

1. ~~**Approve the dev dependencies** for 6b–6c~~ Approved on 2026-11-22.
2. ~~**Pre-commit lint**~~ Decided 2026-11-22: Biome's own `--staged`.
3. ~~**Pre-push hook**~~ Decided 2026-11-22: none; CI enforces.
4. **React component tests** in 6a: approve `@testing-library/react`, `@testing-library/user-event` and `jsdom`, or keep 6a to non-UI code for now?
5. **Which of f–p** to include.
6. **Phase numbering:** answered on 2026-11-22: renamed to Phase 6, and the later phases renumbered (shelf filter fixes 7, dashboard 8, profile 9, journal 10, quality and deploy 11, mobile API 12, mobile app 13, subscriptions 14).
