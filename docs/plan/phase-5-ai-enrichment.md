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
- tsc, lint and the 1,020 tests pass. **`npm run build` wasn't run** (the permission was denied). Checked in the app by the user on 2026-11-21. `npm run build` passed at the end of 5a.

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
- tsc, lint and the 1,020 tests pass. Checked in the app by the user on 2026-11-21. `npm run build` passed at the end of 5a.

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
- tsc, lint and the 1,020 tests pass. `npm run build` passes for the whole of 5a (2026-11-21). **The user must:** check the four "Done when" points signed in, on a laptop and a phone.

## 5b — AI enrichment ✅ built (2026-11-22), build and deploy pending

Split into steps on 2026-11-21. The requirements gathered before then are kept as they were, under "Original requirements" at the end of this section. Each step ends with `npx tsc --noEmit`, `npm run lint` and `npm test` passing. `npm run build` runs once, at the end of 5b.

**Applies to every step**

- **Catalog books only:** enrichment runs once per shared `Book` (`ownerId` null), never per user, and never on a private document (see open question 2).
- **Curated lists only:** genres and tropes come only from the `Genre` and `Trope` tables (seeded from `assets/lists/`: 28 genres, 71 tropes). A name the model returns that isn't on a list is dropped.
- **AI never overwrites the user:** AI rows are written with `source: AI` and `skipDuplicates`, so an existing row, `USER` or `AI`, is never changed. AI never removes a row.
- **Server-only:** the Anthropic client lives in `src/config/anthropic.ts` (`import "server-only"`), and `ANTHROPIC_API_KEY` never gets a `NEXT_PUBLIC_` prefix. Its name goes in `.env.example` with a placeholder; the user adds the value to `.env.local` and Vercel.
- **Untrusted input:** titles, authors and descriptions are passed to the model as data, never as instructions. The model's output is validated with zod before anything is written.
- **Model:** `claude-haiku-5-5`, as the original requirements say, with low effort (classification). Structured output (`output_config.format` with a JSON schema) rather than forced tool use, which current models reject. A `refusal` stop reason or invalid output counts as a failed attempt.
- **New tables get RLS** in the same migration, as AGENTS.md requires.

### 5b1 — Synopsis for books added without a lookup ✅ built (2026-11-21)

Comes first, so enrichment can use the description.

- **Migration:** `Book.descriptionCheckedAt DateTime?`, additive.
- **`books/book.service`:** `fillMissingDescription` gains a provider-id path (`openLibraryId`, `googleBooksId`) next to the ISBN one, and records `descriptionCheckedAt` on a miss so the book isn't tried again. Still never overwrites, still skips private books, and never matches by title.
- **When it runs:** after a manual add (`after()` in the controller, as the ISBN and search adds already do), and for imported books from the 5b4 job, before they're enriched.
- **Known limit:** Amazon imports carry an ASIN and rarely an ISBN, and neither provider looks up by ASIN, so most imported books will stay without a synopsis (see open question 6).

**Done when:** a manual add with an ISBN gets its synopsis; a miss is recorded and not retried; a private document is never looked up.

**Outcome (✅ built 2026-11-21):**

- Migration `20261121120000_add_book_description_checked_at` adds `Book.descriptionCheckedAt`. **Not applied yet** (the permission was denied): the user runs `npx prisma migrate deploy` locally and on Supabase.
- `metadata.service.findDescriptionById(source, sourceId)`: Open Library through `fetchDescription`, Google Books through `lookupId`.
- `fillMissingDescription` without a provider record tries `openLibraryId`, then `googleBooksId`, then the ISBN. A miss sets `descriptionCheckedAt` (`book.model.markDescriptionChecked`), and a checked book isn't looked up again without a record; a record from a later add by search or ISBN is still tried. A book with no id and no ISBN isn't marked, since nothing was tried.
- `addManualBook` in the controller runs `saveSynopsis` in `after()`, as the ISBN and search adds do.
- **Fix (2026-11-21, asked by the user):** an add whose provider record has no synopsis now also tries the book's provider ids and ISBN before recording a miss. *Highly Suspicious and Unfairly Cute* was added from an Open Library record without one, while Google Books has one; it's filled locally now.
- **Known limit:** a provider that's down counts as a miss (`tryProvider`), so a book added during an outage is marked and not retried.
- The import path waits for 5b4. tsc, lint and the 1,031 tests pass.

### 5b2 — The enrichment service, not yet wired in ✅ built (2026-11-21)

- **Dependency:** `@anthropic-ai/sdk`, a release at least two weeks old (needs the user's approval, see open question 8).
- **`src/server/enrichment/`:**
  - `enrichment.rules.ts` (pure): builds the request from the book and the two lists, parses and validates the reply (zod), keeps only names on the lists, normalizes tags (trimmed, lower case, unique, at most 10, each at most 30 characters), and works out `lengthCategory` from the page count (thresholds in open question 3).
  - `enrichment.model.ts`: reads books to enrich, writes `BookGenre` / `BookTrope` rows with `skipDuplicates`, fills `tags` and `lengthCategory` only when they're empty, and sets `aiEnrichedAt`.
  - `enrichment.service.ts`: `enrichBook(bookId)` for one book, inline.
- **Failures:** a migration adds `Book.aiAttempts Int @default(0)`. A failed call or invalid reply adds 1; after 3 the book is skipped.
- **Tests** (in `src/server/tests/`): the rules exhaustively; the service with the SDK and the model mocked (an off-list genre is dropped, a `USER` row stays, a private book is refused, a refusal counts as a failed attempt).

**Done when:** the tests pass and one real call, run by hand on a local book, fills its genres, tropes, tags and length.

**Outcome (✅ built 2026-11-21):**

- **Decided by the user on 2026-11-21:** `@anthropic-ai/sdk` approved (pinned at 1.6.0, released 2026-11-05). Length: NOVELLA under 150 pages, SHORT 150–249, MEDIUM 250–500, LONG over 500; without a page count the model guesses. No confidence score and no Sonnet retry; the retry moved to [Phase 10](phase-10-subscriptions.md), for subscribers.
- Migration `20261121130000_add_book_ai_attempts`: `NOVELLA` added to `LengthCategory`, and `Book.aiAttempts Int @default(0)`. **Not applied yet.**
- `src/config/anthropic.ts` (server-only): a client created on first use (30 s timeout, 2 retries), `createMessage`, and the error checks.
- `enrichment/enrichment.rules.ts` builds the request: Haiku 5.5 at low effort, a JSON schema whose genre and trope items are enums of the curated names, the book as JSON data in the user message, and the synopsis capped at 3,000 characters. It also parses the reply: anything but `end_turn`, or JSON that fails `enrichment.schema.ts`, is a failure. Names are matched to the lists case-insensitively, with at most 1 genre and 1 trope (asked by the user on 2026-11-21; the first valid name the model gives is kept). Tags may name other genres and tropes that also fit, as well as free-form keywords, but never the genre or trope picked, and tags are normalized. The page count wins over the model's length guess.
- `enrichment.model.ts`: `saveEnrichment` first sets `aiEnrichedAt` only on a shared, unenriched book. Rows are added with `skipDuplicates` and `source: AI`, and tags and length are filled only while blank. `recordFailedAttempt` increments `aiAttempts`.
- `enrichment.service.ts` `enrichBook(bookId)`: a private book throws; an enriched book or one with 3 attempts makes no call. A failed call or an invalid reply counts an attempt. A missing or rejected key (401/403) and anything that isn't an API error is rethrown without counting.
- `scripts/enrich-book.ts` for the hand-run call (`--dry-run` prints the request). `.env.example` has `ANTHROPIC_API_KEY`.
- tsc, lint and the 1,072 tests pass.
- **Real call (2026-11-21, local):** *The MacGregors* (411 pages) got Romance and Historical Fiction, two tropes, and MEDIUM; a second run returned `already-enriched` without a call. That reply had **no tags**, though a repeat request for the same book returned seven, so tags (and tropes) vary between runs. Since then (asked by the user), the schema requires at least one tag (`minItems: 1`, and `min(1)` in zod), and a reply without one is a failed attempt; a real request with it returned ten tags. One request is about 5,200 input tokens (the lists with their descriptions) and 90 output tokens.
- **The user must:** apply the migration on Supabase.

### 5b3 — Enrich single adds inline ✅ built (2026-11-21)

- After a manual, ISBN or search add, `after()` in the controller calls `enrichBook` when the book has no `aiEnrichedAt`, after the synopsis fill.
- A per-user limit through `consumeRateLimit` (a new `AI_ENRICH` bucket), so one reader can't run up the bill.
- Never blocks or fails the add: an error is logged and the book is left for the 5b4 job.

**Done when:** adding a book fills its genres and tropes within seconds, and re-adding it doesn't call the API again.

**Outcome (✅ built 2026-11-21):**

- `library.service.finishAdd(userId, added)` replaces `saveSynopsis`. All three adds (manual, ISBN, search) run it in `after()`: first `fillMissingDescription`, then, for a shared book with no `aiEnrichedAt`, `consumeRateLimit(userId, "AI_ENRICH")` and `enrichBook`. A private or already-enriched book makes no call and isn't counted.
- `AI_ENRICH` is 10 a minute per user. Hitting it, or any error, is logged and never thrown; the book stays unenriched for 5b4's backlog.
- tsc, lint and the 1,076 tests pass. **Not checked in the app:** that needs the 5b2 migration and `ANTHROPIC_API_KEY`. Then add a book and check its `BookGenre`/`BookTrope` rows, re-add it, and check the logs show no second call.

### 5b4 — Imports and the backlog, through Message Batches ✅ built (2026-11-22)

- **Migration:** an `EnrichmentBatch` table (`id`, the Anthropic batch id, `status`, `bookIds`, `createdAt`, `endedAt`), with RLS.
- **Submitting:** after an Amazon import, `after()` submits the import's new catalog books as one batch (50% cheaper). Books already in a pending batch are skipped.
- **Collecting:** a cron route (`app/api/cron/enrichment/route.ts`) checks the `CRON_SECRET` header, collects ended batches (results keyed by `custom_id`, which is the book id, never by position), writes them with the 5b2 rules, and submits the remaining backlog: catalog books with no `aiEnrichedAt` and fewer than 3 attempts. The schedule goes in `vercel.json` (see open question 5).
- **Backfill:** the library already on Supabase (1,349 books) goes through the same backlog. At Haiku 5.5's batch price that's well under $1 (see open question 8).

**Done when:** an import's books are enriched once the next cron run collects the batch, and a second run doesn't send them again.

**Outcome (✅ built 2026-11-22):**

- **Decided by the user:** the cron runs once a day (Hobby), the backfill of the existing catalog is approved, imported books get the 5b1 synopsis lookup before they're batched, and batches cache the system prompt.
- Migration `20261122000000_add_enrichment_batch`: the `EnrichmentBatch` table (`anthropicBatchId` unique, `status` SUBMITTED or COLLECTED, `bookIds`, `createdAt`, `endedAt`), with RLS. **Not applied yet.**
- `enrichment.service`:
  - `submitEnrichmentBatch(bookIds?)` first runs the synopsis lookup for books that still need one (at most 40 a run, 4 at a time). A book left over waits for the next run. It then sends up to 1,000 shared books with no `aiEnrichedAt`, fewer than 3 attempts and not in a SUBMITTED batch, one request each with `custom_id` set to the book id, the system prompt marked `cache_control`, and records the batch.
  - `collectEnrichmentBatches()` reads every ended batch and writes only results whose `custom_id` is in that batch's `bookIds` and whose book is still shared. An errored result or invalid reply counts an attempt; an expired or canceled one doesn't, so it's sent again.
  - `runEnrichmentCron()` collects, then submits the backlog.
- **Import:** `importEach` returns `sharedBookIds` (shared books new to the reader's library, never private ones). The Amazon import route sends them in `after()` through `enrichImportedBooks`, which logs instead of throwing. The response to the extension is unchanged.
- **Cron:** `app/api/cron/enrichment/route.ts` (GET, `maxDuration` 300) checks `isCronRequest` in `auth.guard.ts`: `Authorization: Bearer <CRON_SECRET>`, compared in constant time, and refused when the secret isn't set. `inkwell/vercel.json` schedules it daily at 04:00 UTC. `.env.example` has `CRON_SECRET`.
- tsc, lint and the 1,106 tests pass.
- **Real run (2026-11-21, local):** the first cron run sent *Highly Suspicious and Unfairly Cute* as a batch, a second sent nothing (pending), and a third, 2 minutes later, collected it: Romance, Enemies to Lovers, MEDIUM. The cache was written (4,952 tokens).
- **Bug found and fixed:** tags were never saved, here or in 5b2's inline call. `Book.tags` has no default, so books hold NULL, which Prisma's `isEmpty` doesn't match; `saveEnrichment` now matches NULL too. The two local books enriched before the fix have no tags.
- **The user must:**
  1. Apply the migration locally and on Supabase.
  2. Add `CRON_SECRET` to `.env.local` and Vercel.
  3. Check that Vercel's root directory is `inkwell/`, where `vercel.json` sits.
  4. After the deploy, the first cron run sends the backlog: up to 1,000 books a day, so the 1,349 take two days.

### 5b5 — Show genres, tropes, tags and length ✅ built (2026-11-22)

- Read only, in the shelf's edit dialog and on shelf cards (the exact place is open question 7). Shown as the reader's own value when there is one, else the catalog's.
- Shelf filters by genre or trope wait for a later step.

**Done when:** an enriched book shows its genres, tropes, tags and length; a book without them shows nothing extra.

**Outcome (✅ built 2026-11-22):**

- **Asked by the user:** shelf cards get two lines at the end: "Genre - Trope" and the tags. Each looks like the read dates, through one shared `BookCard/CardPill.tsx`, which the read dates now use too. A book without them shows neither line.
- `library/book-topics.rules.ts` (pure): `firstTopic` picks one genre and one trope, the reader's (USER) first, then the oldest. Asked by the user: the API returns them separately, `ShelfBook.genre`, `trope` and `tags` (an array, `[]` for NULL), and the card formats them: "Genre - Trope", and the tags joined with commas.
- **Shelf filters (asked by the user):**
  - The search also matches part of any one tag. Migration `20261122010000_add_book_tag_search` adds `Book.tagSearch` ("|high school|rivals|", from `books/dedupe.tagSearchText`) and fills it from the saved tags; `saveEnrichment` writes it with the tags. **Not applied yet.**
  - Redesigned by the user: a funnel button (with a count of active filters) opens a popover (`npx shadcn add popover`) of toggle chips, one row for genres and one for tropes, plus "Clear filters" (`BookShelf/TopicFilter/`). A book matches any genre ticked and any trope ticked. Cards show "Genre (Trope)" and up to 3 tag pills, with "+N" and a tooltip for the rest.
  - The choices are in the URL as `?genre=` and `?trope=` (names, trimmed, at most 10 each) and survive tab, format, sort and page changes. The page loads the names through `books/book.service.listTopics` (`books/topic.model.ts`).
  - The page the user pointed to (cfas.ca's map) refused to load (403), so its design couldn't be copied.
- **Not done:** length isn't shown, and the edit dialog shows none of them; neither was asked for. The edit dialog gets them in 5b6.
- tsc, lint and the 1,111 tests pass. **Not checked in the app:** the user must start the dev server.

**Follow-up (2026-11-22, asked by the user):** the filter popover stacks each label above its chips on phones and is capped at `min(28rem, 70vh)` with its own scroll. The chip and bubble colors are theme tokens (`--chip-border`, `--chip-selected`, `--chip-selected-foreground` in `globals.css`, with dark values). Tapping a card's "Genre (Trope)" pill adds them to the filters, and tapping a tag searches for it.

**Tropes by genre (2026-11-22, the user chose a join table):** migration `20261122020000_add_genre_trope` adds `GenreTrope` (`genreId`, `tropeId`), with RLS. Each trope in `assets/lists/tropes.ts` lists its genres (drafted by the agent, 71 tropes, for the user to review), and the seed keeps the table in sync, removing links the list no longer has. With genres ticked, the filter shows only their tropes, plus any trope already ticked; "No tropes for these genres" when there are none. **The user must:** apply the migrations and run `npx prisma db seed`, locally and on Supabase.

### 5b5a — Tell the genre and trope apart from tags on cards ⏳ pending

Asked by the user on 2026-11-22, to do later. Today the "Genre (Trope)" pill and the tag pills look the same. For example: filled for genre and trope, outlined for tags.

### 5b5b — Tooltips that work on phones ✅ built (2026-11-22)

Asked by the user on 2026-11-22, as the next step. A tooltip opens on hover or focus only, so a tap on a phone shows nothing; that includes the cards' "+N" tags and every other tooltip in the app. Each one either becomes a popover on touch screens, or shows its content another way. List every `Tooltip` use first.

**Done when:** every tooltip's content can be read on a phone by tapping, and still shows on hover on a laptop.

**Outcome (✅ built 2026-11-22):**

- `components/common/TapTooltip.tsx`: a tooltip that a tap toggles. A mouse click keeps it open, and hover, focus, Escape and tapping elsewhere work as before. The click's default is stopped, so a trigger inside a label doesn't tick or focus the field.
- **Used for:** the ⓘ hints in `TextField`, `StatusField` (status, each status, dates), `FormatsField` and `TitleSearchField` (all now with an `aria-label`), and the card's "+N" tags.
- **Unchanged:**
  - `BookTitle` already opened on tap.
  - The "Add another read" button's tooltip only repeats its label, and tapping it adds the read.
- tsc, lint and the 1,118 tests pass. **Not checked on a phone.**

### 5b6 — Edit them ✅ built (2026-11-22)

- Depends on open question 1: where a reader's edits are stored.
- `AddBookForm` gains the fields, as the AGENTS.md form rule requires. Removing an AI genre or trope is remembered, so a later AI run can't add it back.

**Done when:** a reader can add and remove genres, tropes and tags, and an AI run never undoes their edit.

**Outcome (✅ built 2026-11-22):**

- **Decided by the user:**
  - Per-user overrides.
  - One genre and one trope per reader.
  - The trope picker lists the chosen genre's tropes.
- **Deviation:** since it's one of each, the overrides are columns on `UserBook` rather than `UserBookGenre` / `UserBookTrope` tables. Migration `20261122030000_add_user_book_topics` adds them: `genreId`, `tropeId` (both `ON DELETE SET NULL`), `tags`, `tagSearch`, and `genreEdited` / `tropeEdited` / `tagsEdited`. An edited value that's null or empty means the reader removed it. **Not applied yet.**
- **Rules:** `book-topics.rules` `shownTopics` shows the reader's value once edited, else the catalog's. `topicEdits` keeps an edit only where it differs from the catalog's, so going back to the catalog's value follows the catalog again, as authors do. The AI writes only the catalog, so it can't undo a reader's edit.
- **Input:** `shelf-actions.schema` reads `genre`, `trope` and `tags` (comma-separated: lower case, at most 10, each at most 30 characters), and leaves them unchanged when they aren't sent. `books/book.service.findTopicIds` checks the names against the curated lists.
- **Shelves:** `listShelfPage` shows the reader's values. The genre and trope filters and the search (tags, genre and trope names) match the reader's row when edited, else the catalog's.
- **Form:** `AddBookForm` gains `topics` and `TopicsField.tsx`: a genre select, a trope select narrowed to the genre (with "Show all tropes"), and a tags field. Only the shelf's edit dialog passes `topics` (through `shelves/topics-context.tsx`); a new book gets them from the AI.
- tsc, lint and the 1,132 tests pass. **Not checked in the app.**

### 5b7 — Privacy policy and closing ✅ built (2026-11-22), build pending

- `/privacy` says that book details (title, authors, description, pages) of shared catalog books are sent to Anthropic to suggest genres and tropes, and that private documents never are.
- AGENTS.md status, `.env.example` (`ANTHROPIC_API_KEY`, `CRON_SECRET`), and this plan's outcomes.
- `npm run build` for the whole of 5b.

**Outcome (✅ built 2026-11-22):**

- `/privacy` (last updated 22 November 2026):
  - A "Genres, tropes and tags" section: shared catalog books' title, subtitle, authors, year, pages and synopsis go to Anthropic, once per book or up to three times on failure. Private documents and anything about the reader never do.
  - Synopsis lookups send an ISBN or provider id to Open Library and Google Books.
  - Reader-edited genre, trope and tags are in "Your library"; Anthropic is in "Where your data is kept".
- `.env.example` already had `ANTHROPIC_API_KEY` and `CRON_SECRET`. AGENTS.md status covers 5b1 to 5b6.
- tsc, lint and the 1,132 tests pass. **`npm run build` for the whole of 5b is still to run:** the user stops the dev server first.
- **The user must, on Supabase:** apply the 5b migrations (`20261121120000` to `20261122030000`), run `npx prisma db seed` (for `GenreTrope`), add `ANTHROPIC_API_KEY` and `CRON_SECRET` on Vercel, check that the Vercel root directory is `inkwell/`, and redeploy. The first cron run sends the backfill.

### Open questions

1. **Where do a reader's genre, trope and tag edits go?** `BookGenre`, `BookTrope` and `Book.tags` are on the shared catalog, so one reader's edit would change the book for everyone, which AGENTS.md forbids for per-user state. Recommended: per-user override tables (for example `UserBookGenre` and `UserBookTrope` with an added or removed flag, plus `UserBook.tags`), shown over the catalog's, as `UserBook.authors` already does. The catalog then holds only AI rows. This is an architectural change, so it needs your approval.
2. **Private documents:** recommended to skip them entirely. The other option is a per-user setting to opt in.
3. ~~**Length thresholds**~~ Decided 2026-11-21: NOVELLA under 150, SHORT under 250, MEDIUM 250 to 500, LONG over 500; the model guesses without a page count.
4. ~~**The Sonnet retry on low confidence**~~ Decided 2026-11-21: dropped, with no confidence field; moved to [Phase 10](phase-10-subscriptions.md) for subscribers.
5. **Cron schedule:** Vercel's Hobby plan runs a cron at most once a day, so an import would wait up to a day for its genres. Is once a day fine, or is the project on Pro (which allows every few minutes)?
6. **Synopsis for Amazon imports:** accept that most imports stay without one (recommended, it keeps the "sure match only" rule), or look for another sure match for ASINs later.
7. **Where to show them:** recommended in the edit dialog, plus up to 3 genre chips on shelf cards. Or only in the dialog.
8. **Approvals:** ~~adding `@anthropic-ai/sdk`~~ (approved 2026-11-21), and sending the 1,349 existing catalog books' titles, authors and descriptions to Anthropic for the backfill.

### Original requirements

- A server-only module that uses the Anthropic SDK with structured output (tool use / JSON schema). The model may pick only from the genre and trope names in the DB. It returns `genres[]`, `tropes[]`, `tags[]` (free-form, capped), `lengthCategory` (short/medium/long, based on page count when known) and a confidence score.
- Run it once per catalog `Book`, never per user. Large Amazon imports use the **Message Batches API** (50% cheaper); single adds run inline. Default model: `claude-haiku-5-5`, with `claude-sonnet-5-5` as an option for books where Haiku returns low confidence.
- Run it in the background so imports return immediately: a Vercel Cron route processes `aiEnrichedAt IS NULL` books in batches. Add a queue service (Inngest / QStash) later if needed.
- You can always edit or override the AI's tags per book.
- **Synopsis for books added without a lookup** (asked by the user on 2026-11-15): Amazon imports and manual adds have no provider record, so their `Book.description` starts empty. Before enrichment, or when a future book details page first opens one, fill it once from a provider.
  - **Only with a sure match:** a provider id (`openLibraryId`, `googleBooksId`) or an ISBN. Never from a title search alone, which can pick another book.
  - **Private documents are skipped:** they're never sent to an outside service.
  - **A miss is recorded** (for example a `descriptionCheckedAt` timestamp, a new additive migration), so it isn't retried on every open.
  - **Never overwrites** an existing description. Adds by search and ISBN fill it at add time instead (Phase 4c follow-up).
