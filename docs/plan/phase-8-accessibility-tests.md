# Phase 8 — Accessibility tests

[← Plan overview](README.md)

🚧 In progress. 8a and 8b built (2026-11-22); 8c–8d planned, questions 3–4 pending. Asked by the user on 2026-11-22, to come after Phase 7 and before the dashboard (Phase 9), so new pages are built against these checks.

**Applies to every step**

- **Automated checks catch only part of accessibility** (axe finds roughly a third of WCAG issues). The keyboard and screen-reader pass in 8d covers the rest.
- **Target: WCAG 2.2 AA.**
- New dependencies are pinned to a release at least two weeks old and need the user's approval (question 1).
- Component tests stay in `src/components/tests/<folder>/`; coverage stays at 95%.
- Each step ends with `npx tsc --noEmit`, `npm run lint` and `npm test` passing; the user runs `npm run build` at the end.

## 8a — axe in the component tests ✅ (2026-11-22)

1. ~~Add `vitest-axe`~~ `axe-core` 4.14.0 alone, approved by the user on 2026-11-22: `vitest-axe` has had no stable release since 0.1.0 (2022), so no matcher library or setup in `vitest.config.ts`.
2. A shared helper, `components/tests/a11y.ts` (`expectAccessible(root = document.body)`), runs the WCAG 2.2 A/AA rules and turns off the ones jsdom can't judge (`color-contrast`, `label-content-name-mismatch`, and `region` for components rendered alone).
3. Every component test file gets at least one axe check of its main state; dialogs, popovers and menus are checked open as well as closed.
4. Fix what it finds, each fix with a test.

### Outcome (8a)

- `axe-core` 4.14.0 (exact) as a dev dependency; `components/tests/a11y.ts` fails with each violation's rule, help and element.
- 45 component test files check their main state, and dialogs, menus, popovers and the drawer open. The hook and context tests (`hooks/`, `ShelfSelection`, `topics-context`, `context/context`) render no markup and have none.
- It checks `document.body` by default, since Base UI opens popups in a portal outside the container.
- `label-content-name-mismatch` is off too: it measures icon fonts on a canvas, which jsdom lacks. 8b checks it in a browser.
- Fixed:
  - `layout/Sidebar/Content.tsx`: the sidebar links sat straight in the `<ul>`; each is now in a `SidebarMenuItem` (`<li>`).
  - `new/TitleSearchField.tsx`: with the results open, Base UI hides the rest of the page from screen readers, label included, so the title field lost its name. The input now names itself with `aria-labelledby` on the label.
  - Each is caught by the axe check in its test (both fail without the fix).

## 8b — axe on the real pages, in a browser ✅ (2026-11-22)

1. Playwright with `@axe-core/playwright`, run against `npm run build && npm start` with a seeded test user (question 2: how to sign in without Google).
2. Every route: `/login`, `/privacy`, `/`, `/books/shelves` (each shelf tab, the filter popover open, the edit dialog open), `/books/new`, `/settings`. In light and dark mode, at phone and desktop widths.
3. This is where colour contrast and landmarks are checked, which jsdom can't do.
4. Fix what it finds.

### Outcome (8b)

- Approved on 2026-11-22: `@playwright/test` 1.65.0, `@axe-core/playwright` 4.14.0 and `playwright-core` 1.65.0 (listed so axe's peer doesn't pull 1.65.1, under two weeks old), Chromium only; the Firebase Auth emulator through `firebase-tools` 15.35.0; Playwright starts the servers.
- `npm run test:a11y` (`playwright.config.ts`, `e2e/`): Playwright starts the Auth emulator (`npm run e2e:emulator`, project `demo-inkwell`) and `npm run build && next start` on port 3100, built into `.next-e2e` (`NEXT_DIST_DIR`) so `.next` is untouched. Every variable comes from `inkwell/.env.test` (committed: placeholders and fakes only, CI's database address) with a gitignored `.env.test.local` on top for this machine's database password, read by `e2e/env.ts` and passed explicitly, so no real Firebase project, key or database from `.env.local` is used; a variable missing there is passed empty, never taken from `.env.local`.
- `e2e/global-setup.ts`: checks `.env.test` (a database other than the app's, a `demo-` project, matching emulator hosts), migrates and seeds its `DATABASE_URL`, makes a fresh emulator user, signs in through `/login`, and replaces that user's library with six books across the lists.
- `e2e/a11y.spec.ts`: WCAG 2.2 A/AA plus axe's best practices (landmarks, headings) on `/login`, `/privacy`, `/`, each shelf tab, the filter popover and edit dialog open, `/books/new`, and `/settings` (both tabs); at desktop (1280×800) and phone (Pixel 7) sizes.
- **Dark only:** the app has no light mode (`dark` is set on `<html>` in `app/layout.tsx`), so there is nothing to check in light.
- `src/config/firebase.ts` connects to the emulator when `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST` is set; `firebase-admin.ts` refuses to start with `FIREBASE_AUTH_EMULATOR_HOST` on Vercel.
- `firebase-tools` brings 12 moderate `npm audit` findings (16 in all, from 4), dev-only: `@opentelemetry/core`, `glob`, `uuid`, through `@google-cloud/pubsub`, `archiver` and `exegesis`. Not overridden.
- First run on 2026-11-22: all 26 pass after these fixes.
  - **Colour contrast:** the dark theme's gold (`anzac-600`) was 4.44:1 against the background, as text (the phone tab bar's current tab) and behind dark text (primary buttons, highlighted menu items, ticked chips). `--primary`, `--accent` and `--chip-selected` are now `anzac-500` (about 6.7:1); rings and charts, which need only 3:1, keep `anzac-600`, and so does `--sidebar-primary`, which nothing uses. **The gold is a little lighter everywhere.**
  - **Landmarks:** the sidebar is a plain `div` in shadcn, so its contents sat outside any landmark. `ui/sidebar.tsx`'s `Sidebar` now renders the part holding its children as a `<nav>` named by its `aria-label` (desktop, phone drawer and non-collapsible), edited by hand at the user's request; `AppSidebar` passes `aria-label="Sidebar"` (tested in `AppSidebar.test.tsx`).
  - **Dialog name:** the genre and trope filter's popover is a dialog with no name; it's now "Filter books" (tested in `TopicFilter.test.tsx`).
- Not app bugs, handled in the test:
  - The card menu fades out under the edit dialog, and axe read its items through the backdrop (1.02:1), so the test waits for the menu to be removed.
  - Axe measures a checkbox by the part not clipped by the dialog's scrolling body, so the format boxes, half under its bottom edge, read as too small. The test scrolls them to the middle first.
- A reused `.next-e2e` once kept an old stylesheet, so each run deletes it and builds from scratch.
- Each run's emulator user has a new uid, so the setup deletes last run's `User` row with the same email first. The app has the same gap: a Firebase account deleted and recreated with the same email can't sign in (`upsertUser` by id hits the unique email). Not fixed here.

## 8c — In CI

1. The component axe checks run with `npm test`, so they're in CI as soon as 8a is done.
2. A new job in `.github/workflows/ci.yml` runs the Playwright checks against a Postgres service (question 3).
3. A violation fails the build. A known issue that can't be fixed yet goes in an allowlist with a reason, rather than a rule being turned off.

## 8d — Manual pass and the extension

1. A checklist in this file: keyboard-only use of every page (focus order, visible focus, no traps, Escape closes popovers and dialogs), VoiceOver on macOS and iOS, 200% zoom and reflow at 320px, reduced motion.
2. The Chrome extension's popup and options page (`extension/`): axe on the pages and the same keyboard pass (question 4).
3. Record what was found and fixed in an "Outcome" section.

### Open questions

1. **Dependencies:** `axe-core` approved for 8a (2026-11-22); `@playwright/test`, `@axe-core/playwright` and `firebase-tools` approved for 8b (2026-11-22).
2. ~~**Signing in for browser tests**~~: the Firebase Auth emulator (2026-11-22).
3. **Browser tests in CI:** on every PR, or only on `main` and nightly, since they're slower?
4. **The extension:** include it here, or leave it to Phase 12 with the store release?
