# Phase 5 — AI enrichment (Claude API)

[← Plan overview](README.md)

## 5.0 — Security updates, before 5a ✅ done (2026-11-21)

### Outcome

- **Next 16.4.3 → 16.4.5** (`"next": "^16.4.5"`). The 16.4.4 and 16.4.5 release notes are bug-fix backports and the seven advisories only; nothing touches the proxy, server actions, `after()` or `images`, so no code changed.
- **`effect` 3.22.4** as an exact override.
- **Deviation:** `fast-xml-parser` is pinned with an exact override, `5.12.0`, instead of `npm update`. `npm update` took 5.12.1, released 2026-11-13, which isn't two weeks old. 5.12.0 has the fix.
- **`npm audit`:** 4 moderate findings, all one `minimatch` advisory through `shadcn`. That's fewer than the 6 expected: the `deepmerge` finding no longer shows. AGENTS.md now says 4.
- **Checked:** `tsc`, lint (the 2 existing warnings), 1,020 tests, the build (without the security warning it showed before), `prisma migrate status`, and the new build served on port 3100. Public pages load, private pages and APIs refuse requests that aren't signed in, an Open Library cover goes through the image optimizer, and an unlisted host is refused (400).
- **The user must:** restart the dev server on port 3000, which still runs 16.4.3. Check signed in: a shelf with covers, an add by ISBN and by search, and an extension import. Redeploy production.

### Plan

Asked by the user on 2026-11-21. `npm audit` now reports 9 findings (1 low, 5 moderate, 3 high), against the 7 that AGENTS.md lists as known. Two are new: Next and `effect`.

**1. Next 16.4.3 → 16.4.5 (the user's request)**

- Next 16.0.0 to 16.4.4 have seven moderate advisories, all fixed in 16.4.5:
  - [GHSA-7qx7-33qx-rqx2](https://github.com/advisories/GHSA-7qx7-33qx-rqx2): SVG rejection bypass in image optimization.
  - [GHSA-f3mh-rxg3-f5g2](https://github.com/advisories/GHSA-f3mh-rxg3-f5g2): HttpOnly cookie exposure on Edge runtime routes.
  - [GHSA-pc58-hwjq-p385](https://github.com/advisories/GHSA-pc58-hwjq-p385): cross-client response injection when self-hosting.
  - [GHSA-mfr8-8qww-v76h](https://github.com/advisories/GHSA-mfr8-8qww-v76h), [GHSA-vc7v-qv4w-wrv8](https://github.com/advisories/GHSA-vc7v-qv4w-wrv8), [GHSA-rhh4-g77r-r9qj](https://github.com/advisories/GHSA-rhh4-g77r-r9qj) and [GHSA-vvgp-ww4w-46vf](https://github.com/advisories/GHSA-vvgp-ww4w-46vf): `use cache`, `unstable_cache()` and Cache Components.
- **What applies to Inkwell:** only the image optimizer one. Covers go through it, from Open Library and Google Books only, and the app doesn't set `dangerouslyAllowSVG`. Inkwell doesn't use `use cache`, `unstable_cache`, Cache Components or Edge runtime routes. Upgrade anyway: it's a patch release.
- **Version:** 16.4.5 was released on 2026-11-03, so it's past the two-week rule. 16.4.6 (2026-11-09) isn't two weeks old until 2026-11-23, so don't take it before then.
- **Steps:** from `inkwell/`, run `npm install next@16.4.5`, which sets `"next": "^16.4.5"`. Read the 16.4.4 and 16.4.5 release notes for anything that affects the proxy, server actions, `after()` or `images`.

**2. `effect` 3.20.0 → 3.22.4 (new, high)**

- [GHSA-7589-6fvf-x4pw](https://github.com/advisories/GHSA-7589-6fvf-x4pw) (published 2026-11-19): a ReDoS in `Schema.TemplateLiteral`, in `effect` up to 3.22.0. It comes in through `prisma` → `@prisma/config`, which pins `effect` 3.20.0. That's the Prisma CLI's config loader, so it runs at build and migrate time only, never on untrusted input. The risk is low, but npm counts it three times as "high" (`effect`, `@prisma/config`, `prisma`).
- **Don't run `npm audit fix --force`.** It would downgrade Prisma 7 to 6.12.0.
- **Fix:** add `"effect": "3.22.4"` to `overrides` in `package.json`. That's an exact pin, because 3.22.5 (2026-11-19) is too new. 3.22.1 is the first fixed version; 3.22.4 was released on 2026-10-22. Then run `npm install`, and check that `npx prisma generate`, `npx prisma migrate status` and `npm run build` still work. Drop the override once Prisma ships a fixed `@prisma/config`.

**3. `fast-xml-parser` (already due)**

- AGENTS.md says to run `npm update fast-xml-parser` on or after 2026-11-17. It's still 5.11.2. Run it now and drop that note from AGENTS.md.

**Done when**

1. `npm ls next` shows 16.4.5, `npm ls effect` shows 3.22.4 and `npm ls fast-xml-parser` shows 5.12.0 or later.
2. `npm audit` shows only the 6 known `shadcn` findings, and the AGENTS.md "Dependencies" section says so.
3. `npx tsc --noEmit`, `npm run lint`, `npm test` and `npm run build` pass.
4. The app runs: sign in, a shelf with covers, an add by ISBN and by search, and an extension import.
5. AGENTS.md's status and Phase 0's notes mention Next 16.4.5.

## 5a — One add form instead of three tabs ⏭️ next

Asked by the user on 2026-11-21, as the first step of Phase 5. `/books/new` loses its Search, ISBN and Manual tabs. It shows the one `AddBookForm`, with the search built into the title field and the ISBN lookup moved to the top of the form.

**Applies to every substep**

- `AddBookForm` stays the only book form, as the AGENTS.md rule requires. It gains a prop that turns the lookups on (for example `lookups`), used only on `/books/new`. The shelf's edit dialog never searches or looks up.
- **No server changes:** `addManualBook`, `addBookByIsbn`, `addSearchBook`, `lookUpIsbn`, `previewSearchResult` and the search route stay as they are, and so does the synopsis fill after an add by search or ISBN.
- **Already in your library** works as it does now: the details are locked, the status is hidden, only formats and the acquired date can be added, and the button reads "Add formats".
- Each substep ends with `npx tsc --noEmit`, `npm run lint`, `npm test` and `npm run build` passing, and the page checked in the running app. The tabs stay usable until 5a4, so the page works between substeps.

### 5a1 — ISBN at the top of the form

- In `AddBookForm`, the ISBN field becomes the first field, above the cover. That's one field order, so it moves in the shelf's edit dialog too.
- Nothing else changes yet: no lookup in the form, and the three tabs stay.

**Done when:** the Manual tab and the edit dialog show the ISBN first, and adding and editing still work.

**Outcome (✅ built 2026-11-21):** in `AddBookForm.tsx`, the ISBN field now sits right after `header` (the looked-up book's preview on the ISBN and Search tabs) and above the cover. No other changes. tsc, lint, the 1,020 tests and the build pass. Checked in the app by the user on 2026-11-21.

### 5a2 — ISBN lookup and scanning inside the form

- **Move the logic out of the tab.** The lookup and scan controls in `IsbnLookup.tsx` move into a component the form uses, for example `IsbnLookupField.tsx`: the ISBN field with "Look up" and the "Scan barcode" dropdown (photo upload and live scan, as today) beside it. It's shown only when `lookups` is on.
- **Found:** the form fills in from the preview, as `AddPreviewedBook` does today. Title, subtitle and ISBN are locked, the ISBN goes in a hidden field, and the form saves through `addBookByIsbn`.
- **Not found:** a short note under the field. The ISBN stays as typed, the reader fills in the rest, and the form saves through `addManualBook`.
- **"Not this book":** a button above the fields clears a looked-up book and goes back to a blank manual form, keeping the typed ISBN.
- The ISBN tab can then be removed, because the Manual tab does what it did.

**Done when:**

1. Typing an ISBN and pressing "Look up", or scanning a photo or the live camera, fills the form.
2. An ISBN that isn't found keeps the form editable, with the ISBN filled in.
3. "Not this book" goes back to a blank form.
4. A book already in the library offers only "Add formats".
5. The edit dialog shows a plain ISBN field, without the lookup.

**Outcome (✅ built 2026-11-21):**

- `IsbnLookupField.tsx` holds what `IsbnLookup.tsx` did: the ISBN field, "Look up" and the "Scan barcode" dropdown (photo and live). It has no form of its own, since it sits inside the book form, so Enter in the field looks up instead of submitting. `TextField` gained an `onKeyDown` prop for that.
- `AddBookForm` gained `lookups`, set only by the Manual tab. A found book stands in for the form's props (`previewBook`, `previewHidden`, locked catalog fields, `addBookByIsbn`, "Add formats" when it's already in the library) and remounts the form. "Not this book" sits beside the preview header and remounts a blank form with the looked-up ISBN kept. A successful add starts blank.
- `BookPreview.tsx` exports `previewHidden` and `actionSubmit`, shared by the Search tab and the form.
- Asked by the user on 2026-11-21: a book already in the library shows the formats the reader owns ticked and locked (`previewBook` fills `formats` from `inLibrary`; `FormatsField` gained `owned`). Unticking them couldn't remove them, since adding again only adds formats. This applies to the Search tab too.
- The ISBN tab and `IsbnLookup.tsx` are removed; `AddBookTab` is `"search" | "manual"`. The Search tab's "Fill in by hand" still opens a blank Manual tab.
- tsc, lint and the 1,020 tests pass. **`npm run build` wasn't run** (the permission was denied). Checked in the app by the user on 2026-11-21. `npm run build` is run once, at the end of 5a.

### 5a3 — Search in the title field

- **The dropdown component.** Add shadcn's combobox on Base UI (`npx shadcn add combobox`). It's a vendored component on Base UI, which the app already uses, not a new npm dependency.
- **Move the logic out of the tab.** `useBookSearch` and the result row in `SearchLookup.tsx` move into a component the form uses, for example `TitleSearchField.tsx`. It's shown only when `lookups` is on; otherwise the title is a plain text field.
- **Searching:** typing a title or author (from 3 characters, after a 400 ms pause, cancelling the previous request) opens a dropdown under the field. It calls `GET /api/books/search` and lists each result's small cover, title, authors, year and the "In your library · List" badge, with a loading line and a "No books found" line.
- **Picking a result** calls `previewSearchResult` and fills the form like a found ISBN: the catalog fields are locked, `source` and `sourceId` are hidden, and the form saves through `addSearchBook`. "Not this book" clears it too, keeping the typed title.
- **Not picking one** is a manual add, with the typed text as the title.
- **Keyboard and screen readers:** arrow keys move through the results, Enter picks one, and Escape closes the list. Enter with the list closed doesn't submit the form early.
- **On a phone** the dropdown fits the screen width and scrolls.
- The Search tab can then be removed.

**Done when:**

1. Typing three or more characters in the title shows results in a dropdown.
2. Picking one fills the form with the catalog fields locked, and "Add book" adds it with its provider record.
3. A title typed without picking a result adds the book by hand.
4. The results can be used with the keyboard alone, and the dropdown fits a phone screen.
5. The edit dialog's title is a plain field, without the search.

**Outcome (✅ built 2026-11-21):**

- `npx shadcn add combobox` added `ui/combobox.tsx`, with `ui/input-group.tsx` and `ui/textarea.tsx` as its dependencies (the existing `button` and `input` were left as they were).
- `TitleSearchField.tsx` holds `useBookSearch` (now keyed by the query string) and the result row: a small cover, title, authors, year and the "In your library · List" badge, in the combobox's dropdown, with "Searching…", an error line and "No books found". Base UI does the arrow keys, Enter to pick and Escape; Enter otherwise never submits the form. Only typing changes the title, so closing the list without a pick keeps what was typed. The dropdown is capped at the screen width and its list scrolls.
- `AddBookForm` (with `lookups`) shows it in place of the plain title. A picked result goes through `previewSearchResult` and fills the form as a found ISBN does; a preview with a `ref` saves through `addSearchBook`, one without through `addBookByIsbn`. "Not this book" keeps the typed title too.
- The Search tab and `SearchLookup.tsx` are removed, with the `AddBookTab` and `SearchRequest` types. `AddBookTabs` has only the Manual tab until 5a4, and `AddPreviewedBook` in `BookPreview.tsx` is unused until 5a4 removes it.
- tsc, lint and the 1,020 tests pass. Checked in the app by the user on 2026-11-21. `npm run build` is run once, at the end of 5a.

### 5a4 — One form, no tabs

- `/books/new` renders `AddBookForm` with `lookups` directly. `AddBookTabs.tsx`, `SearchLookup.tsx`, `IsbnLookup.tsx` and the "Fill in by hand" buttons are removed once nothing uses them, and `AddBookTab` leaves `src/types/ui.type.ts`. `BookPreview.tsx` is kept only if the form still uses `previewBook` or `PreviewHeader`.
- Update the AGENTS.md form rule and status, which still mention the Manual, ISBN and Search tabs.

**Done when:**

1. `/books/new` shows one form with no tabs, the ISBN lookup at the top and the search in the title field.
2. Every way of adding still works: by hand, by ISBN, by scanning and by search.
3. The shelf's edit dialog still works.
4. The user checks the page signed in, on a laptop and on a phone.

**Outcome (✅ built 2026-11-21):**

- `/books/new` (`components/pages/books/new/index.tsx`) renders `<AddBookForm lookups />` directly. `AddBookTabs.tsx` is removed; `IsbnLookup.tsx`, `SearchLookup.tsx`, the "Fill in by hand" buttons and `AddBookTab` already went in 5a2 and 5a3.
- `BookPreview.tsx` stays for `PreviewHeader`, `previewBook`, `previewHidden` and `actionSubmit`, which the form uses; `AddPreviewedBook` is removed.
- AGENTS.md: the `AddBookForm` rule now names `/books/new` and `lookups`, and the status has a 5a line. Stale "tab" comments in `books.type.tsx` and `isbn-book.schema.test.ts` are updated.
- tsc, lint and the 1,020 tests pass. **The user must:** check the four "Done when" points signed in, on a laptop and a phone, and run `npm run build` for the whole of 5a.

## 5b onward — AI enrichment (to be split into steps)

- A server-only module that uses the Anthropic SDK with structured output (tool use / JSON schema). The model may pick only from the genre and trope names in the DB. It returns `genres[]`, `tropes[]`, `tags[]` (free-form, capped), `lengthCategory` (short/medium/long, based on page count when known) and a confidence score.
- Run it once per catalog `Book`, never per user. Large Amazon imports use the **Message Batches API** (50% cheaper); single adds run inline. Default model: `claude-haiku-5-5`, with `claude-sonnet-5-5` as an option for books where Haiku returns low confidence.
- Run it in the background so imports return immediately: a Vercel Cron route processes `aiEnrichedAt IS NULL` books in batches. Add a queue service (Inngest / QStash) later if needed.
- You can always edit or override the AI's tags per book.
- **Synopsis for books added without a lookup** (asked by the user on 2026-11-15): Amazon imports and manual adds have no provider record, so their `Book.description` starts empty. Before enrichment, or when a future book details page first opens one, fill it once from a provider.
  - **Only with a sure match:** a provider id (`openLibraryId`, `googleBooksId`) or an ISBN. Never from a title search alone, which can pick another book.
  - **Private documents are skipped:** they're never sent to an outside service.
  - **A miss is recorded** (for example a `descriptionCheckedAt` timestamp, a new additive migration), so it isn't retried on every open.
  - **Never overwrites** an existing description. Adds by search and ISBN fill it at add time instead (Phase 4c follow-up).
