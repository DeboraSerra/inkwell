# Phase 8 — Accessibility tests

[← Plan overview](README.md)

🚧 In progress. 8a built (2026-11-22); 8b–8d planned, questions 2–4 pending. Asked by the user on 2026-11-22, to come after Phase 7 and before the dashboard (Phase 9), so new pages are built against these checks.

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

## 8b — axe on the real pages, in a browser

1. Playwright with `@axe-core/playwright`, run against `npm run build && npm start` with a seeded test user (question 2: how to sign in without Google).
2. Every route: `/login`, `/privacy`, `/`, `/books/shelves` (each shelf tab, the filter popover open, the edit dialog open), `/books/new`, `/settings`. In light and dark mode, at phone and desktop widths.
3. This is where colour contrast and landmarks are checked, which jsdom can't do.
4. Fix what it finds.

## 8c — In CI

1. The component axe checks run with `npm test`, so they're in CI as soon as 8a is done.
2. A new job in `.github/workflows/ci.yml` runs the Playwright checks against a Postgres service (question 3).
3. A violation fails the build. A known issue that can't be fixed yet goes in an allowlist with a reason, rather than a rule being turned off.

## 8d — Manual pass and the extension

1. A checklist in this file: keyboard-only use of every page (focus order, visible focus, no traps, Escape closes popovers and dialogs), VoiceOver on macOS and iOS, 200% zoom and reflow at 320px, reduced motion.
2. The Chrome extension's popup and options page (`extension/`): axe on the pages and the same keyboard pass (question 4).
3. Record what was found and fixed in an "Outcome" section.

### Open questions

1. **Dependencies:** `axe-core` approved for 8a (2026-11-22); approve `@playwright/test` and `@axe-core/playwright` for 8b?
2. **Signing in for browser tests:** the Firebase Auth emulator, or a test-only API token on the seeded user (never enabled in production)?
3. **Browser tests in CI:** on every PR, or only on `main` and nightly, since they're slower?
4. **The extension:** include it here, or leave it to Phase 12 with the store release?
