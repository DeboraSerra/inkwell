# Phase 8 — Accessibility tests

[← Plan overview](README.md)

🚧 In progress. 8a–8c built (2026-11-22); 8d's automated checks built (2026-11-22), its manual pass is the user's. Asked by the user on 2026-11-22, to come after Phase 7 and before the dashboard (Phase 9), so new pages are built against these checks.

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

## 8c — In CI ✅ (2026-11-22, first CI run pending)

1. The component axe checks run with `npm test`, so they're in CI as soon as 8a is done.
2. A new job in `.github/workflows/ci.yml` runs the Playwright checks against a Postgres service (question 3).
3. A violation fails the build. A known issue that can't be fixed yet goes in an allowlist with a reason, rather than a rule being turned off.

### Outcome (8c)

- `.github/workflows/ci.yml` has an "Accessibility in a browser" job (`a11y`), on every pull request and on pushes to `main` and `dev` like the other jobs (question 3, answered by the user on 2026-11-22). It runs Postgres 17 as a service with the `inkwell_e2e` database `.env.test` points at, installs Chromium with its system libraries, and runs `npm run test:a11y`; on failure it uploads `e2e/.results/` (traces) for 14 days. With `CI` set, Playwright reports in GitHub's format, retries a failed test once, and never reuses a running emulator.
- The allowlist is `e2e/a11y-allowlist.ts`: entries of rule, the start of axe's selector, and a reason. It's empty. Matching elements are left out of the failure; everything else still fails.
- Chromium is cached with `actions/cache` v6.1.0 (pinned by commit, like the other actions), keyed by the Playwright version; its system libraries are installed on every run.
- Checked locally with `CI=1 npm run test:a11y` (26 passed); the job itself first runs on the next push.

## 8d — Manual pass and the extension 🚧 (checks built 2026-11-22; manual pass to do)

1. A checklist in this file: keyboard-only use of every page (focus order, visible focus, no traps, Escape closes popovers and dialogs), VoiceOver on macOS and iOS, 200% zoom and reflow at 320px, reduced motion.
2. The Chrome extension's popup and options page (`extension/`): axe on the pages and the same keyboard pass (question 4).
3. Record what was found and fixed in an "Outcome" section.

### Manual checklist

What the tests can't judge. Tick each with the device and date; note anything found under "Outcome (8d)".

**Keyboard** (desktop Chrome and Safari; `e2e/keyboard.spec.ts` already checks that Tab never gets stuck, every stop shows a focus ring, and Escape closes the shelf's popups, the edit dialog, the scan and account menus and the phone drawer, giving focus back)

- [x] Every page: the focus order follows the reading order, and nothing is skipped or reached twice. — ✅ Chromium via Playwright, 2026-11-22
- [ ] Shelves: tick books, move them and delete them with the keyboard only; arrow keys move within the tabs, menus and the sort list. *Works, but focus is lost after a move or delete (finding 1).*
- [ ] Add a book: the title search's results are chosen with the arrow keys and Enter; scanning can be cancelled. *Works, but focus is lost after picking a result (finding 1).*
- [x] Every dialog: focus starts on its first field or button, stays inside while it's open, and returns to the button that opened it. — ✅ Chromium via Playwright, 2026-11-22 (edit, delete, scan; see finding 8)
- [x] Toasts: a message after saving is announced and doesn't steal focus. — ✅ Chromium via Playwright, 2026-11-22

**VoiceOver on macOS** (Safari)

- [ ] Landmarks (VO+U): the sidebar, the main content and, on the shelves, the tab list are listed, with clear names.
- [ ] Headings: one level-1 heading per page, the rest in order.
- [ ] Every control is read with its name, role and state (ticked, pressed, expanded, current page).
- [ ] Shelves: a card reads its title, authors and details once each; changing a filter or page announces the new results.
- [ ] Add a book: errors are read when the form is sent; "Searching…" and "Opening the book…" are announced.

**VoiceOver on iOS** (Safari)

- [ ] The tab bar, the "More" drawer and every dialog work by swiping and double-tapping; the drawer closes with the two-finger scrub.
- [ ] Tap-only tooltips (the ⓘ buttons, cut-off titles) open and are read.
- [ ] Barcode scanning: the camera dialog is announced and can be closed.

**Zoom and reflow** (`keyboard.spec.ts` already checks no sideways scroll at 320px)

- [x] 200% browser zoom on a 1280px-wide window: nothing is cut off or overlapping, and nothing needs scrolling sideways. — ✅ Chromium via Playwright, 2026-11-22
- [ ] 200% text size only (Safari's text zoom, or iOS's larger text): labels and buttons grow without clipping. *Fails on shelf cards in Chromium (finding 6); recheck in Safari.*

**Reduced motion** (`keyboard.spec.ts` already checks that dialogs and popovers don't animate)

- [x] With "Reduce motion" on in macOS or iOS: the drawer, dialogs, menus and toasts appear without sliding or zooming; spinners stand still with their text. — ✅ Chromium via Playwright, 2026-11-22 (emulated)

**The extension** (`e2e/extension.spec.ts` already runs axe on the options page in light and dark, and on the import dialog)

- [x] Options page: Tab order is App URL, API token, the Settings link (in the token's hint), Save and test; the result is announced (`role="status"`). — ✅ Chromium via Playwright, 2026-11-22
- [ ] On Amazon's real page: the toolbar shortcut (Ctrl/⌘+Shift+S) opens the dialog with focus in the pages field; it can be sent and cancelled with the keyboard, and the result is announced.

### Manual pass in Chromium (2026-11-22)

Run with the Playwright MCP against `npm run e2e:serve` and the test user. VoiceOver, iOS, Safari and Amazon's real page still need the user; the VoiceOver findings below come from Chromium's accessibility tree, so check them with VoiceOver too.

**Findings, not fixed yet:**

1. **Focus is lost after an action removes its control.** After a bulk move, a bulk delete, "Mark as" from a card menu, and picking a title search result, focus falls to `<body>`, so a keyboard or screen-reader user starts again from the top. Send it somewhere sensible (the tab panel, the next card, or the form's first unlocked field).
2. **Every signed-in page is titled "Inkwell"** (WCAG 2.4.2). `/privacy` already has "Privacy · Inkwell"; `/`, `/books/shelves`, `/books/new` and `/settings` need their own `metadata.title`.
3. **The shelves' and settings' tab lists have no name.** Landmarks read "navigation Sidebar", "main", "search", "tablist" with nothing after it.
4. **Filter and search results aren't announced.** Changing the shelf, searching or filtering updates the list (and "No books on … match these filters") with no live message; the "1 - 2 of 2" count isn't live either.
5. **Repeated text on cards and fields.**
   - Card pills read "Genre (trope): Genre and trope: Action (…), Show books like this" and "Tags: Tag: Slow Burn, Search this tag": the visible label and the hidden prefix say the same thing (`BookCard/index.tsx`, `CardPill.tsx`).
   - Fields with an ⓘ button take its name into their label: "Subtitle About Subtitle", "Tags About tags", "Status About status", "Formats you own About formats".
6. **200% text size breaks shelf cards** (root font size doubled, 1280px wide): the title and author cut to one word ("The…", "Mara…"), the card menu overlaps the title, the format icon sits outside the card, and the genre pill spills over its edge. The rest of the pages grow cleanly; the sidebar's menu items are 4–8px taller than their fixed height.
7. **`/settings`'s level-1 heading is "Welcome, Ada Reader"**, the same as Home; it should name the page.
8. **The delete confirmation** is a `dialog`, with focus on "Delete": pressing Enter twice deletes. An `alertdialog` with focus on "Cancel" is safer for an action that can't be undone.
9. Minor: the bulk move's message reads "Moved 1 to Reading, skipped 0."; leave out "skipped 0".

**Passed:** focus order on every page (no skips, no repeats), dialog focus (start, trap, return) for the edit, delete and scan dialogs, Escape returning focus, arrow keys in tabs, menus, submenus, sort and books-per-page lists, the title search by keyboard, toasts announced without moving focus, one level-1 heading per page with no skipped levels, every control named, 200% browser zoom (640×400) with no sideways scroll or clipping, and reduced motion (every animation and transition 0.01 ms, the "Searching…" spinner stopped with its text).

### Outcome (8d, so far)

- Question 4 and the automation, answered by the user on 2026-11-22: the extension is included here, and what a browser can check is automated. Both new spec files run with `npm run test:a11y`, so in CI too (now 78 checks; the CI step's name says so).
- `e2e/keyboard.spec.ts`:
  - Tab through every page (signed out and in) until focus leaves it: no trap, every stop on screen with an outline or ring.
  - Escape closes the filter popover, the sort, card and scan menus, the books-per-page list, the edit dialog, the account menu and the phone drawer, and focus goes back to the button that opened it.
  - No sideways scroll at 320px wide on any page.
  - Reduced motion: no animation runs when the filter popover or the edit dialog opens.
- `e2e/extension.spec.ts`: axe on the options page (empty, connected and token refused; light and dark) and on the import dialog (open and a failed account check), from the extension's own files with its Chrome APIs stubbed; the dialog opens with focus in the pages field and is used with the keyboard.
- Fixed:
  - **Phone tab bar:** its links showed focus only by a text colour; they now have an inset ring.
  - **Tab panels** on the shelves and settings pages are focusable (Base UI) but showed no focus; they now have the same ring as buttons.
  - **One focus style:** a `focus-ring` utility in `globals.css` (a solid 2px ring in `--ring`, 3:1 against the background) replaces the hand-written rings on the tab bar, the tab panels, card pills, cut-off titles and filter chips; the title's and the panels' were a faded ring.
  - **Reduced motion:** dialogs, menus, popovers, the drawer and toasts still zoomed and slid. `globals.css` now cuts animations and transitions to nothing under `prefers-reduced-motion: reduce` (spinners stop; each has text).
- **For the manual pass:** the test user's email, password and name are in `.env.test` (`E2E_USER_*`, emulator-only fakes). To use it by hand: `npm run e2e:emulator`, then `npm run e2e:serve` (the emulator build on port 3100), then `npm run e2e:user` (fresh user and its six books); sign in at `http://localhost:3100/login`.
- Not changed: the extension's import dialog doesn't close on Escape (Cancel does). It's a form in Amazon's page rather than a modal, so WCAG doesn't ask for it; adding it would need a new extension release.
- **To do (user):** the unticked checklist items (VoiceOver, iOS, Safari text zoom, Amazon). **To decide:** whether to fix findings 1–9 here, before 8d closes.

### Open questions

1. **Dependencies:** `axe-core` approved for 8a (2026-11-22); `@playwright/test`, `@axe-core/playwright` and `firebase-tools` approved for 8b (2026-11-22).
2. ~~**Signing in for browser tests**~~: the Firebase Auth emulator (2026-11-22).
3. ~~**Browser tests in CI**~~: on every PR and push, like the other jobs (2026-11-22).
4. ~~**The extension**~~: included here (2026-11-22).
