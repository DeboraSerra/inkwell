# Phase 3 — MVP: add books and browse them

[← Plan overview](README.md)

**Status: ✅ 3a–3d done; ✅ the DNF, `&amp;` and shelf-search fixes are built and the backfill is run locally and on Supabase (a signed-in browser check still needs you); ⏭️ next: 3e, then 3f.** 3a to 3d are committed, and the ["Done when"](#done-when) list was checked on 2026-11-08 (see "Checked" under it). The Docs-tab issue found during that check is fixed in the extension, but the fix hasn't been run on the real page yet.

Goal: add books manually or through the Chrome extension, move them between lists, and browse them with filters.

## The model this phase uses

- **Five lists, and the list is the status.** `UserBook.status` alone decides where a book appears. The lists are views in the UI; moving a book between them only changes that column.

  | List in the UI | `status` |
  |---|---|
  | Wishlist | `WISHLIST` |
  | TBR | `TO_READ` |
  | Reading | `READING` |
  | Finished | `FINISHED` |
  | DNF | `DNF` |

- **Formats are a detail of the book, not a list.** `UserBook.formats` is a multi-value column holding any of `EBOOK`, `PHYSICAL` and `AUDIO`. Empty means not owned.
- **Formats move a book between Wishlist and TBR, and nowhere else.** A `WISHLIST` book that gets a format becomes `TO_READ`. A `TO_READ` book that loses its last format becomes `WISHLIST`. Reading, Finished and DNF books keep their status, so you can finish a borrowed book you don't own.

## Out of scope

Search and ISBN lookup (Phase 4), AI tags (Phase 5), reading log, reviews, goals, drag-to-reorder (Phase 6), deployment (Phase 7).

## 3a — Rework the model

Phase 2c built shelves to hold the lists, and one `ownership` value per book. Status now defines the lists, so both go.

1. **Schema**, in a new, additive migration:
   - Replace `UserBook.ownership` with `formats BookFormat[]`, using a new enum `BookFormat` (`EBOOK | PHYSICAL | AUDIO`). Existing rows convert, and `NONE` becomes an empty list.
   - Drop `Shelf`, `ShelfItem`, `ShelfKind` and `SystemShelfType`. They only hold data derived from status, so nothing is lost.
   - Add `ReadThrough`: `userBookId`, `startedAt?`, `endedAt?`, `outcome?` (`FINISHED | DNF`). One row per read; a row with no `outcome` is the current read. Dates are optional because a bulk move doesn't know when a book was read.
   - Remove `UserBook.startedAt` and `finishedAt`, moving existing dates into `ReadThrough` rows.
2. **Remove the shelves module:** delete `src/server/shelves/` and its tests, the `syncSystemShelf` calls in the library service, and the `ensureSystemShelves` call at sign-in.
3. **Rules, `status.rules.ts`:**
   - The Wishlist/TBR choice depends on whether `formats` is empty, in place of the old `Ownership` checks.
   - A status change also decides what happens to the reads, and **earlier reads are never erased:**

     | Change | Read history |
     |---|---|
     | Wishlist or TBR → Reading | Opens a new read |
     | Finished → Reading (a reread) | Opens a new read and keeps the finished one |
     | DNF → Reading | Reopens the DNF read, keeping its start date |
     | Reading → Finished or DNF | Closes the current read |
     | Wishlist or TBR → Finished | Adds a finished read |
     | Wishlist or TBR → DNF | Adds a DNF read (added by the DNF fix) |
     | Finished → DNF | Adds a DNF read and keeps the finished one (added by the DNF fix) |
     | Reading → Wishlist or TBR | Discards the current read, since it was put back; closed reads stay |
     | Finished or DNF → Wishlist or TBR | No change |

4. **Services:**
   - Replace `updateOwnership` with `updateFormats(userId, userBookId, formats)`.
   - `updateStatus` applies the status and read changes in one transaction.
   - Add `updateStatuses(userId, userBookIds, status)` for bulk moves, in one transaction. Reads it creates have no dates. A book that can't make the move is skipped and reported, without failing the rest.
   - Change `addBookToLibrary` to add formats instead of returning an existing row unchanged. A book you own as physical keeps that format when an import adds `EBOOK`, and a wishlist book moves to TBR. Status and dates are never overwritten.
5. **Reads:** extend `listUserBooks` with a formats filter (any of). It already filters by status and searches title and author. Newest added first, with cursor pagination.
6. **Tests:** every format and status combination, every row of the read history table, wishlist → TBR and back, the additive re-add, and a bulk move with a skipped book.

### 3a outcome

- **Schema:** adds `formats` and `ReadThrough`, and removes `ownership`, `startedAt`, `finishedAt` and the shelf tables.
- **Migration reset:** after this step, the database and all migrations were deleted and regenerated from `schema.prisma`, so the whole schema is now in one migration, `20261031014133_init`. Older migration names in these plans no longer exist. Nothing was deployed, so no database needs the old history. From here on, migrations are only added.
- **Code:** `status.rules.ts` is rewritten around formats and read changes; `read-through.model.ts` is new; `library.service.ts` gains `updateFormats` and `updateStatuses`; `src/server/shelves/` is gone.
- **Choices the plan left open:**
  - A book added or moved straight to Finished gets an end date but no start date, rather than an invented one.
  - A bulk move runs in a fixed number of queries, so it fits in one transaction.
- **Verified:** tests, and 21 checks on the local database with throwaway rows.

## 3b — Add books manually

1. `addManualBook` in the books and library services: find the catalog book with `findExistingBook`, or create it, then add it to the library. Both happen in one transaction.
2. Controller with input validation using zod (approved as a new dependency): title and at least one author required; subtitle, cover URL, page count and ISBN optional.
3. Add-book form: the catalog fields, plus checkboxes for ebook, physical and audiobook. **No format ticked means Wishlist.**

### 3b outcome

- **UI:** built with shadcn. Client components live in `src/components/`, and the login, settings and header UI were converted too.
- **Page:** `/books/new`, linked as "Add book" in the header. After a successful add, the form clears and shows which list the book went to, so you can add several in a row.
- **Code:** `findOrCreateManualBook` (`book.service.ts`), `addManualBook` (`library.service.ts`), the `addManualBook` server action (`library.controller.ts`), and validation in `library/manual-book.schema.ts`. `addBookToLibrary` can join a caller's transaction.
- **Choices the plan left open:**
  - Authors are separated by semicolons, because a name can contain a comma ("Tolkien, J. R. R.").
  - A book matching one already in the shared catalog is reused as it is, so a subtitle, cover or page count typed for it is ignored. Otherwise one user's typing would change what others see.
  - Cover URLs must be `https`.
- **Verified:** tests; the services on the local database with throwaway rows; the form's look on desktop and mobile; and that submitting without a real session goes to `/login` and writes nothing.
- **Form behaviour:** checked in the browser with real clicks through a temporary action: a rejected form keeps text and ticks, and a success clears them.
- **Not verified:** a real submit while signed in through Google.
- **Added after the outcome above, status field:** the form can add a book as Currently reading, Already read or Did not finish. The default, Not started, keeps the Wishlist/TBR rule. It's a radio group (`ui/radio-group.tsx`) because a book has one status.
  - The dates are optional, so a read can have none, and a book read years ago isn't dated today. Phase 6 goals will need to account for finished books with no end date.
  - Adding a book already in the library still ignores the chosen status and only adds formats.
  - Verified with real submits on the local database through a temporary page and action, since removed: all statuses, a rejected form, and a re-add. Google sign-in still not exercised.
- **Added after that, read dates:** Already read asks for optional start and finish dates, and Currently reading for an optional start date. Each takes a day, month and year, of which the year alone or the month and year are enough. Did not finish has no dates.
  - **Schema:** migration `add_read_date_precision` adds the `DatePrecision` enum (`DAY | MONTH | YEAR`) and `ReadThrough.startedAtPrecision` and `endedAtPrecision`, defaulting to `DAY`. A partial date is stored as the first day of its month or year, in UTC.
  - **Rules:** `library/partial-date.rules.ts`. Future dates are rejected, with one day's margin for time zones. A start after the finish is rejected only when the two periods can't overlap, so March 2024 to "2024" is allowed.
  - Dates are ignored when the book is already in the library, like the status.
  - Verified with real submits on the local database through a temporary page and action, since removed.

## 3c — Add books through the extension

1. **Extension:**
   - Keep the scraper and also capture the **ASIN** (from the row's id or link) for reliable deduplication.
   - Replace the clipboard copy with `POST {APP_URL}/api/imports/amazon`.
   - Add an options page for the app URL and API token, with progress and a result message ("42 new, 310 already in library").
2. **`manifest.json`:** run the content script only on `https://www.amazon.*/hz/mycd/*`, with `host_permissions` for the app URL.
3. **Route handler:** authenticate with `getRequestUser`, validate the payload with a size limit, and treat every scraped field as untrusted. Upsert `Book` rows (ASIN → ISBN → dedupe key), add each to the library with `EBOOK` and source `AMAZON_IMPORT`, and return the created and existing counts.

### 3c outcome

- **Route:** `POST /api/imports/amazon` takes `{ books: [{ asin, title, authors, coverUrl }] }`, up to 200 books and 1 MB per request, and returns `{ created, existing, skipped }`.
- **Code:** `src/server/imports/` (`amazon-import.schema.ts`, `imports.service.ts`) and `findOrCreateAmazonBook` in `book.service.ts`.
- **Extension:** clicking it asks how many pages to read, starting from the open one (empty means all), then sends 100 books at a time, with progress in a banner on the page. The result stays on screen until closed, green for success, amber if books were skipped and red for a failure, with a matching badge on the extension's icon. `options.html` holds the app URL and token and tests them against `/api/me`. The service worker makes the requests, because a content script on Amazon would be blocked by CORS, and the token is kept out of reach of the content script.
- **Deviations and choices:**
  - There's no declared content script. The plan's `https://www.amazon.*/hz/mycd/*` isn't a valid Chrome match pattern, and a declared script misses tabs opened before installing, so clicking the extension injects `app.js` into the current tab (`activeTab` and `scripting`). It reaches Amazon only when clicked, on any Amazon domain.
  - `host_permissions` covers localhost, and any other app URL must be `https` and is requested as an optional permission when saved in the options, since the deployed URL doesn't exist yet.
  - A bad row is counted as skipped rather than failing the import. A bad ASIN or cover is dropped and the book kept.
  - Each book has its own transaction, so a failed import can just be run again.
  - A book matched by title and author keeps its catalog entry unchanged, so it doesn't gain the ASIN.
  - Authors are split on semicolons only, so a comma-separated list from Amazon would stay one author.
- **Verified:** tests; the real `app.js` on a fake content page with a stubbed `chrome` API, against the real route and local database with throwaway rows (two pages, a row with no author, a re-import adding nothing); and route errors with curl.
- **Not verified, needs the user:** loading the extension in Chrome, the options page, `background.js`, and a run on the real Amazon page. In particular, where Amazon puts the ASIN in a row is an assumption: the code searches the row's element ids and links, and a book without one still imports by title and author.

## 3d — Browse, filter and move books

1. **`/` (books page):** tabs for Wishlist, TBR, Reading, Finished and DNF, showing cover, title, authors and format badges.
2. **Filters:** owned format (physical, audio, digital; any combination) and search by title or author, on every list. Keep the list and filters in the URL's query string, so they survive a refresh and can be bookmarked.
3. **Change status** on each book, through a controller that calls `updateStatus`, so it follows the status rules.
   **Bulk move:** select up to 30 books and move them to another list. This is how you clear already-read ebooks from TBR after the first import. Limited to 30 books at a time, and the result says how many moved and how many were skipped.
4. **Edit formats** on each book, so a wishlist book can become owned and move to TBR.
5. **Pagination:** "Load more" using the cursor. Show an empty state on each list.
6. **Covers:** allow only the image hosts actually needed, in `images.remotePatterns`. Manual covers can come from any `https` host, so decide here how to show those, for example with a plain `<img>`.
7. Mobile-first, with `dark:` variants.

### 3d outcome

- **Route, changed at the user's request:** `/books/shelves` instead of the plan's tabs on `/`, and no `/books/tbr`-style routes. The sidebar has one "Shelves" link. The shelf is in the query string with the other filters, as in `/books/shelves?shelf=finished&format=EBOOK&q=dune`, and it opens on TBR. `/` is still the welcome page.
- **Code:** `library/shelf-filters.ts` (URL parsing, pure), `library/shelf-actions.schema.ts`, `listShelfPage` in the service, four actions in `library.controller.ts` (`loadMoreBooks`, `changeBookStatus`, `changeBookFormats`, `moveBooks`), and `components/shelves/`.
- **Choices the plan left open:**
  - "Move to" on a book only offers moves the status rules allow. The bulk menu offers every other shelf, and the server skips what can't move.
  - Choosing Reading or Finished from a book's menu opens a dialog for the dates, starting from today. Dates left blank stay unknown. A bulk move opens no dialog and records no date.
  - Finished → Reading is a reread, so the dialogs start its dates fresh and the finished read stays as it was.
  - "Select first N" selects up to 30 at once; past 30, other checkboxes are disabled.
  - Author search runs against a new `Book.authorSearch` column holding every author's normalized name, so it finds any author by first name, last name or full name, ignoring case and accents. A full name also matches by its last word, so "JRR Tolkien" finds "J. R. R. Tolkien".
  - `dedupeKey` now uses every author's surname, sorted, so author order doesn't matter. A book listed with fewer authors than an existing copy gets a different key, so it's only matched by ASIN or ISBN.
  - The Amazon import splits authors on commas, since Amazon doesn't use semicolons. A two-part value with a one-word first part ("Tolkien, J. R. R.") stays one surname-first name, so "Madonna, Prince Rogers" would stay whole too. Manual entry still uses semicolons.
  - Migration `add_book_author_search` adds the column. After applying it to any database, run `npx tsx prisma/backfill-book-authors.ts` to fill it, recompute `dedupeKey` and split comma-joined Amazon authors. Already run on the local database.
  - Covers use a plain `<img>` with no referrer, since manual covers can come from any `https` host. Biome warns about this one `<img>`.
- **Edit and delete on each card, added at the user's request:**
  - Edit changes status, formats, the latest read's dates, pages, authors and cover. The title can't be edited. A date left blank clears the stored one.
  - Pages, authors and cover are saved on `UserBook` (migrations `add_user_book_page_count` and `add_user_book_authors_cover`) and take priority over the catalog's values, which never change. Clearing one, or entering the catalog's value, goes back to the catalog.
  - Search also covers the reader's own authors (`UserBook.authorSearch`). A book still matches its catalog authors after they're overridden. Dedupe only uses the catalog, so a re-import still finds the same book.
  - Delete asks for confirmation in a dialog, then shows a toast. It removes the `UserBook` and its reads; the `Book` stays. This is the one case where read history is erased, and the dialog says so.
- **Deleting selected books:** the trash button in the selection bar asks for confirmation, then removes up to 30 selected books the same way as a single delete, and shows a toast with the count.
- **Private documents, added at the user's request:** rows from Amazon's Docs tab are sent with `kind: "docs"` and saved as a `Book` with `ownerId` set (migration `add_book_owner`). Only that user's imports can match one, shared lookups skip them, and they carry no ASIN and may have no author. Books already imported from Docs before this can't be told apart and stay shared. The extension detects the tab from `/contentlist/pdocs` in the URL, which still needs checking on the real Amazon page.
- **Pagination, replacing the plan's "Load more":** numbered pages of 30 books, with the page in the URL (`?shelf=tbr&page=2`). The page reloads from the server after a move, so it stays full. A page past the end shows the last one, and changing shelf goes back to page 1. `listShelfPage` and `countUserBooks` use offset paging; `listUserBooks` keeps its cursor option.
- **UI reworked by the user:** tabs (`ui/tabs.tsx`), `BookShelf.tsx` and a menu on each card. Clicking a card selects it; the menu sits outside the label so it doesn't. The selection bar appears once a book is selected, and `ShelfFilterBar` holds search and format filters under the tabs.
- **Verified:** tests, and in the browser against a production build, a throwaway user and 96 seeded books, since removed: paging forward and back with no repeats, a full-size refill after a bulk move, the tabs, out-of-range and invalid pages, no page links on a short shelf, moving a single selected book, search and format filters from the page, both empty messages, and the mobile layout.
- **Not verified:** real Google sign-in (auth was temporarily bypassed for the test), real covers, and paging through a filtered list of more than 30 books.

## Fix: moving a book to DNF (do first, before 3e)

Reported by the user on 2026-11-08: moving a book to DNF doesn't work.

**What happens.** It was reproduced against the local database with a throwaway user, since removed:
- **Reading → DNF works** in all four ways: the card menu, the move dialog, a bulk move and the edit dialog. The read is closed as DNF.
- **TBR, Wishlist or Finished → DNF are refused.**
  - A single move or an edit fails with "Can't change status from TO_READ to DNF for a book with EBOOK".
  - A bulk move skips the books with "Can't move to that list".
  - The card's "Move to" menu never offers DNF for them, because it lists only the moves `canTransition` allows.

**Cause.** `TRANSITIONS` in `library/status.rules.ts` lists DNF only as a move from Reading, following the 3a table. That contradicts the add form, which already lets a book be added straight to "Did not finish" (`initialState` with the `addDnf` read change). Giving up on a book you only started briefly, or before starting it, is common, so the missing moves are the bug.

**Fix:**
1. **Rules (`status.rules.ts`):** add three moves, all using the existing `addDnf` read change (a new read with outcome DNF):

   | Change | Read history |
   |---|---|
   | Wishlist or TBR → DNF | Adds a DNF read |
   | Finished → DNF | Adds a DNF read, for a reread given up on, and keeps the finished read, since earlier reads are never erased |

   DNF → Reading, Wishlist or TBR stay as they are.
2. **Dates follow the existing pattern:**
   - A single move records today as the end date, like moving to Finished.
   - A bulk move records no date.
   - The move dialog offers no DNF dates, as the add form has none for DNF.
3. **Formats don't change:** DNF doesn't depend on owning the book, like Reading and Finished. A Wishlist book stays unowned on DNF.
4. **A readable error:** `InvalidTransitionError` shows the list names from `LIST_NAMES`, not the database values. For example "A book on TBR can't move to DNF", instead of "from TO_READ to DNF for a book with EBOOK".
5. **UI:** the card menu, the bulk menu and the edit dialog all go through `canTransition`, so they offer DNF without further changes. Check each one.
6. **Plan:** add the three rows to the read-history table in 3a.
7. **Tests:**
   - in `status.rules.test.ts`, the three new moves and their read changes
   - in `library.service.test.ts`, a single move with today's end date, a bulk move with no date, Finished → DNF keeping the finished read, and the new error text
   - the card menu offering DNF from TBR

**Done when:** a book on Wishlist, TBR, Reading or Finished can be moved to DNF from its menu, a bulk move and the edit dialog. Each move adds or closes a DNF read without erasing earlier reads.

### DNF fix outcome (2026-11-14)

- **Rules:** `TRANSITIONS` in `status.rules.ts` gains Wishlist/TBR → DNF and Finished → DNF, both `addDnf`. `initialState` no longer special-cases DNF, since the table now covers it.
- **Dates:** no service change was needed. A single move (`updateStatus`) already passes now as the end date, and a bulk move passes none. The edit dialog records no DNF date, as it has no DNF date fields.
- **Error:** `InvalidTransitionError` now reads "A book on DNF can't move to Finished." When a not-started list doesn't fit the formats, it adds why ("…, because you own it").
- **Card menu:** the target list moved to `moveTargets` in `shelf-filters.ts`, so it's unit-tested. The bulk menu and the edit dialog needed no change.
- **Verified:** tests (rules table, service single and bulk moves, Finished → DNF keeping the finished read, the error text, the card menu's targets), typecheck, lint and build.
- **Not verified:** clicking the moves in the browser, signed in.

## Fix: `&amp;` in imported titles (do first, with the DNF fix)

Reported by the user on 2026-11-08: titles with `&` show as `&amp;`.

**What happens.** The rendering is fine, because React escapes text. The text **is stored** with a literal `&amp;`. On the local database, 5 books are affected, all from the Amazon imports of Nov 1:
- "Hunter &amp; The Hunted (Sinclaire Wolf Pack Book 4)"
- "Dial B for Billionaire : a plus-size billionaire romance (Curves &amp; Capital Book 1)"
- "Snow &amp; Ash: Endless Winter"
- "The Boy Who Led Them (The King of Smugglers: … Pirate &amp; Maritime Adventure Trilogy Book 1)"
- "Storm Shelter: A Sapphic Pirate Fantasy (The Dagger &amp; Tide Trilogy)"

No authors, subtitles, reader overrides or books from other sources are affected.

**Cause.** The extension reads titles with `innerText`, which already decodes HTML. So Amazon's own page text must contain `&amp;`, meaning it's encoded twice on Amazon's side. Nothing between the extension and the database decodes it.

The encoded text also reaches `dedupeKey` as an extra word "amp". So "Snow & Ash" typed by hand doesn't match the imported "Snow &amp; Ash". Books with an ASIN still match each other by ASIN.

**Fix:**
1. **A shared decoder,** `decodeEntities` in a pure `books/text.ts`:
   - It covers named entities (`&amp; &lt; &gt; &quot; &apos; &nbsp;`) and numeric ones (`&#39;`, `&#x27;`).
   - It decodes **once**, so `&amp;amp;` becomes `&amp;`, not `&`, and text that really contains `&amp;` isn't over-decoded.
   - It makes one pass with a bounded pattern (`&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,8});`), so it can't backtrack.
   - An unknown entity, or a code point that isn't valid, stays as it was.

   The chain of `replaceAll` calls in `metadata/sanitize.ts` (`stripHtml`) then uses it too.
2. **Decode on the server, not in the extension.** The extension is untrusted input, and a fix there wouldn't help copies of it that aren't updated. Decode in the Amazon import schema (`imports/amazon-import.schema.ts`), for titles and authors from both the Books and Docs tabs, *before* the dedupe key and author search are computed. Run `cleanText` from the metadata module on provider titles and authors as well, so a stray entity from Open Library or Google Books is decoded the same way.
3. **Clean up existing rows:** a one-off script, `prisma/backfill-decode-entities.ts`, modelled on `backfill-book-authors.ts`.
   - For every `Book` (shared or private) and every `UserBook` whose text contains an entity, decode `title`, `subtitle` and `authors`, then recompute `dedupeKey` and `authorSearch`.
   - It's idempotent, and it reports how many rows changed.
   - **It changes data, so run it only with the user's go-ahead,** on the local database first, then Supabase.
   - **Run it before the next Amazon re-import.** Once the import decodes, books without an ASIN would otherwise no longer match their encoded copies by dedupe key.
4. **Tests:**
   - `decodeEntities`: each named entity, decimal and hex, decoding once, unknown entities, invalid code points, plain text unchanged, and a long hostile input finishing quickly
   - the Amazon import schema decoding a title before dedupe
   - `stripHtml` still passing its tests
   - the backfill against the local database: the 5 titles fixed, their keys recomputed, and a second run changing nothing

**Done when:**
- An Amazon title with `&` is stored and shown as `&`.
- The 5 existing titles are fixed and their dedupe keys recomputed.
- A book typed by hand with `&` matches its imported copy.

### `&amp;` fix outcome (2026-11-14)

- **Code:** `decodeEntities` in `books/text.ts`. `&nbsp;` becomes a plain space, so search and dedupe treat it like one.
- **Import:** `amazon-import.schema.ts` decodes titles and authors on both tabs. Authors are decoded *before* being split, so the `;` in `&#39;` doesn't cut a name in two. A title that's only an entity is skipped as blank.
- **Providers:** `cleanText` decodes, so Open Library and Google titles, subtitles and authors are decoded once. `stripHtml` uses `decodeEntities`. `cleanDescription` no longer goes through `cleanText`, so a description isn't decoded twice.
- **Backfill:** `prisma/backfill-decode-entities.ts`, with `--dry-run`. It only touches rows whose text changes when decoded. It decodes `Book.title`, `subtitle` and `authors`, recomputes `dedupeKey` and `authorSearch`, and decodes `UserBook.authors` and its `authorSearch`.
  - A dry run on the local database lists exactly the 5 titles above and 0 library entries, and writes nothing.
  - **Run on the local database on 2026-11-14,** with the user's go-ahead. It fixed the 5 titles, and their dedupe keys now read "and" in place of "amp" (for example `snow and ash|shaver`). No title still contains `&amp;`, no dedupe key is shared, and a second run changed nothing.
  - **Run on Supabase on 2026-11-14,** with the user's go-ahead, after they checked the local result. Its library is larger, so it fixed 41 books, not 5: 40 with `&amp;` and one with `&#34;` ("Burn After Reading: A "Steamy" …"). No library entries changed. Afterwards none of its 1,290 books holds an entity, no dedupe key is shared, and a second run changed nothing.
- **Verified:** tests (each entity, decimal and hex, decoding once, unknown and invalid entities, hostile input, the import schema on both tabs with a hand-typed copy getting the same dedupe key, `stripHtml` and `cleanDescription`), typecheck, lint and build.

## Fix: searching a shelf jumps back to TBR (do first, with the other fixes)

Reported by the user on 2026-11-08: searching for an author on the Finished shelf showed TBR.

**Cause.** In `components/pages/books/shelves/ShelfFilterBar.tsx`, `submitSearch` builds the right address with `shelfHref({ shelf, formats, search })` and calls `router.push`, but it never calls `event.preventDefault()`. So the browser also does its own submission of the form, a plain GET to the current path with only the search box (`/books/shelves?q=…`). That drops `shelf`, the format filters and the page, and `parseShelfFilters` falls back to the default shelf, TBR. Every shelf except TBR is affected. The format checkboxes aren't, because they navigate without a form.

**Fix:**
1. Call `event.preventDefault()` first in `submitSearch`, so only the `router.push` to `shelfHref(...)` happens.
2. **Also make the form right without JavaScript:** add hidden inputs for `shelf` and each selected `format`. Then a submission before the page has hydrated, or with scripts blocked, keeps the shelf and filters too. A new search starts at page 1, as `shelfHref` already does.
3. **Clearing the search box removes the search from the address.** Today the ✕ in the box only empties the field: `?q=` stays in the URL, so the shelf stays filtered until the form is submitted again.
   - Handle it in the input's `onChange`: when the value becomes empty while a search is active (`filters.search` isn't empty), navigate at once to `shelfHref({ shelf, formats, search: "" })`. That keeps the shelf and format filters and goes back to page 1.
   - That covers every way of emptying the box: the ✕ (Chrome and Safari), Escape in a search field (Chrome), selecting all and deleting, or backspacing to empty. Don't rely on the non-standard `search` event, which Firefox doesn't fire.
   - Submitting the form empty does the same, through `submitSearch`.
4. **Tests:**
   - In the browser: search on each of the five shelves, with and without a format filter. The shelf, filters and results stay, and the page resets to 1.
   - Clear the search with the ✕, with Escape, and by deleting the text. Each time `q` leaves the URL, the full shelf shows again, and the shelf and format filters stay.
   - With JavaScript off, search on Finished and stay on Finished.

**Done when:** searching on any shelf stays on that shelf, keeps its format filters, and shows the matching books from page 1. Clearing the search box removes `q` from the address and shows the whole shelf again.

### Shelf search fix outcome (2026-11-14)

- **Code:** in `ShelfFilterBar.tsx`, `submitSearch` calls `preventDefault()`. The form has `action="/books/shelves"` and `method="get"`, with hidden `shelf` and `format` inputs. The input's `onChange` navigates without `q` when the box is emptied while a search is active (blank or spaces only counts as empty).
- **Verified:** typecheck, lint and build.
- **Not verified:** the browser checks above. They need a signed-in session on the dev server.
- **Then, at the user's request: search as you type.** The Search button is gone. The search runs 700 ms after typing stops (`SEARCH_DELAY_MS`), and at once on Enter or when the box is emptied.
  - The box is now controlled. Its own searches don't reset what's being typed meanwhile, and a search changed from outside (Back, a link) shows in the box.
  - Searches use `router.replace`, so Back doesn't step through every pause in typing. Format filters still use `push`, and include text that's typed but not searched yet.
  - A pending search runs on the shelf and filters showing when it fires.
  - Without JavaScript, Enter still submits the form, with the hidden fields.
  - Verified: typecheck, lint, tests and build. Not checked in the browser by me; the user tests it signed in.

## 3e — Polish before Phase 4c (after the fixes)

Added at the user's request on 2026-11-08, after the extension's store build was prepared, and extended since. It covers the extension, the settings page and the shelves. **Do this before continuing Phase 4.**

1. **Say which account an import goes to.**
   - **Why:** the extension sends books to the account that owns the API token in its options, not to whoever is signed in on the website. After switching accounts on the site, an import went to the previous account and nothing said so.
   - **Background script (`background.js`):** on each click, look the account up with `GET /api/me`, the same check "Save and test" uses. Do it every time rather than remembering it from setup, so it's never stale, and a revoked or wrong token is caught before anything on the page is read. Pass `{ account: { email, site } }`, or `{ error }`, along with the `start-import` message.
   - **Import dialog (`app.js`):** the first line reads "Importing into **<email>** on <site>". The email comes from the server, so set it with `textContent`. On an error, show it in the result box and stop before scraping.
   - **Share the failure wording** ("couldn't be reached", "didn't accept the API token", "answered with an error") between the lookup and the batch requests.
   - **✅ Done (2026-11-14):**
     - `background.js` gets `requestInkwell`, used by both the account lookup and the batches, so all three failure messages are shared. It runs before the content script is injected, and passes `{ account: { email, site } }` or `{ error }` with `start-import`. `site` is the app URL's host, such as `localhost:3000`.
     - A reply from `/api/me` with no email counts as an error.
     - The account check comes before the wrong-page check. It used to come after, and the user saw that a click on a wrong page gave no connection error, while the right page did. A connection problem now shows on any page.
     - **Tested** with the real `background.js` in Node and a stand-in for Chrome: a wrong token against the real dev server (401), an unreachable address, a 500, a missing email, and an accepted token on localhost and on an `https` site. Each failure has the same wording for the lookup and for a batch.
     - **Tested** with the real `app.js` on a fake content page in the browser, using a stand-in for Chrome and a fake Amazon address: the dialog's first line names the account and site; an email containing HTML shows as text; a token error stops with the message, a red badge and no batch sent; an unreachable site during a batch keeps its wording; a normal import still sends both rows.
     - **Not tested:** in real Chrome. That comes with the release step (item 11).
2. **Give the options page a favicon.** Its tab shows no icon today. Add `<link rel="icon">` to `options.html` pointing at `icons/icon-16.png` and `icons/icon-48.png`. `build.mjs` already ships those icons. The site's own favicon stays as it is.
   - **✅ Done (2026-11-14):** `options.html` links `icons/icon-16.png` and `icons/icon-48.png` with their sizes, so Chrome picks the sharper one on high-density screens. Checked: both load at their declared sizes on a copy of the page, and a store build to a placeholder domain shipped the links and icons. The previous `extension/dist/` was put back afterwards. Not yet seen in a real Chrome tab.
3. **Redesign the options page** so it looks like Inkwell, keeping it plain HTML and CSS with no build step:
   - **Look:** the logo and the name "Inkwell Kindle import" at the top. Inkwell's colours: navy `#0b1d2d`, cream `#f5f2e9` and gold `#a57b22` / `#d4af37`, from `inkwell/src/app/globals.css`. Light and dark versions following `prefers-color-scheme`.
   - **Fonts:** a system font stack. Loading Geist would mean bundling the font files or loosening the extension's content security policy, which isn't worth it for one page.
   - **Fields:** labelled App URL and API token fields, each with a hint. The token hint links to `<App URL>/settings`, where tokens are created, opening in a new tab.
   - **Result message:** styled for success and failure, announced to screen readers (`role="status"`), with "Connected as <email>" shown prominently after a successful test.
   - **Basics:** visible focus states, and readable at the narrow width Chrome sometimes uses for options pages.
   - **✅ Done (2026-11-14):**
     - **Page:** `options.html` has the logo (`icons/icon-128.png` at 48 px, already in the store build), the name, and a short tagline. The form sits on a card in Inkwell's cream and navy, with a gold button and links in dark mode. All the CSS is inline, with no build step and no fonts loaded.
     - **Fields:** the App URL field has a hint. The token hint links to Settings, and the link follows the address as it's typed: an invalid address falls back to the default one.
     - **Result:** green for success and red for a failure. It's always in the page as `role="status"`, and hidden while empty, so screen readers announce what's put in it. Success shows "Connected as", then the email in large type. A 401, an unreachable site, another error status and a reply with no email each have their own message. The button reads "Testing…" while it checks.
     - **Small additions:** a bad URL puts focus back on the field. In dark mode, a faint outline keeps the navy logo visible on the navy page.
     - **Checked** on a copy of the page in the browser with a stand-in for Chrome's storage: a real 401 from the dev server; a stubbed success, in light and dark; a bad URL at 320 px wide, with no sideways scroll; the gold keyboard focus ring; and the settings link for a typed, an invalid and the default address.
     - **Not checked:** in real Chrome's options window. That comes with the release step (item 11).
4. **Add a copy button for a new API token** on `/settings` (`components/pages/settings/CreateTokenForm.tsx`, on the site). The token is shown only once, and today it has to be selected by hand.
   - **Button:** a shadcn `Button` with lucide's `Copy` icon next to the token, labelled "Copy token" for screen readers. It copies with `navigator.clipboard.writeText`.
   - **Feedback:** the icon turns into a check reading "Copied" for a couple of seconds, plus a toast.
   - **If the clipboard isn't available** (it needs a secure context, which localhost and https are but a plain-http LAN address isn't): select the token's text instead and say "Press ⌘C to copy", so it can still be copied.
   - **Never log the token,** and don't keep it anywhere beyond the component's state, as now.
   - **✅ Built (2026-11-14):**
     - **Component:** a `NewToken` component in `CreateTokenForm.tsx` shows the token with an outline icon button (lucide `Copy`, `aria-label="Copy token"`). After copying, the button reads "Copied" with a check for 2 seconds, and a "Token copied." toast appears.
     - **Fallback:** without `navigator.clipboard`, or if writing to it fails, the token's text is selected and a live message says "Press ⌘C to copy it", or Ctrl+C off Apple devices.
     - **Each new token** remounts the component, so it never starts as "Copied". The token stays only in the action's state and this component.
     - **Verified:** typecheck, lint, tests and build.
     - **Not verified:** clicking it in the browser. `/settings` needs a signed-in session, and the pane isn't signed in.
5. **Let the reader choose how many books a shelf page shows**, with a default of 10 on phones and 30 on desktop (`/books/shelves`, today a fixed 30).
   - **Control:** a "Books per page" select from shadcn, which isn't installed yet (`npx shadcn add select`), offering **10, 20, 30 and 50**. It goes in the filter bar (`ShelfFilterBar`), next to search and the format filters, or by the pagination if that reads better.
   - **Where the choice lives,** most specific first:
     1. **The URL,** `?per=20`, kept with the other filters by `shelfHref` and `parseShelfFilters`, so a link or bookmark keeps it.
     2. **A cookie,** `shelfPerPage`, set when the reader picks a value, so the choice is remembered on later visits and on every shelf. It's a display preference, not personal data.
     3. **The device default:** 10 on phones and 30 otherwise, decided on the server with Next's `userAgent()` (`next/server`; see `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/userAgent.md`), where `device.type === "mobile"` means a phone. Detecting it on the server means the first visit never flickers between sizes. A narrow desktop window and tablets get 30 until the reader picks otherwise.
   - **Changing the size keeps your place:** go to the page that holds the first book currently shown (page = ⌊first book's position ÷ new size⌋ + 1), not back to page 1. Changing the shelf, search or format filters still goes back to page 1, as now.
   - **Service and validation:** `listShelfPage(userId, filters, page, pageSize)` takes the size instead of the fixed `SHELF_PAGE_SIZE`. The URL value and the cookie are parsed in `shelf-filters.ts` and accepted only if they're 10, 20, 30 or 50, so a request can't ask for an arbitrary page size.
   - **Selection:** "Select first N" offers at most the page size or 30, whichever is smaller, and the selection cap stays 30. Bulk moves and deletes keep the server's 30-book limit, so on a 50-book page only 30 can be selected at once, as now.
   - **Page numbers:** `?page=3` means different books at different sizes. A shared link carries `per`, so it opens the same slice. An out-of-range page already shows the last one.
   - **Unchanged:** the refill after a bulk move and the empty states work at every size.
   - **In progress (2026-11-14), the user's restructuring first:**
     - The shelf view is split into `BookShelf`, `SelectedBooksBar` and `BooksPagination`. A shadcn `select` is added, with no logic yet.
     - **App-wide context, at the user's request:** `components/pages/context` (`BooksContext`, `useBooksContext`, `useLoadedShelf`) wraps the `(app)` layout. It holds the signed-in user, passed in by the layout, and the current shelf, so any page can read both.
       - A layout never sees the query string, so the books are loaded on the client: the context parses the shelf filters from `useSearchParams` and calls the `loadShelf` server action (`library.controller.ts`, validated by `shelfParamsSchema`) whenever they change.
       - Another page's query string doesn't reload the shelf. A slower, older answer can't overwrite a newer one.
       - Mutations call `refresh()`, since `revalidatePath` no longer reaches client state.
       - **Trade-off, chosen by the user:** books aren't in the first server render, so the shelf shows a skeleton until the first load.
     - **Verified:** typecheck, tests (including `loadShelf` and `searchParamsRecord`) and the build pass. Not yet checked signed in.
   - **✅ Built (2026-11-14):**
     - **Rules (`shelf-filters.ts`):** `PAGE_SIZES` (5, 10, 20, 30, 50), `parsePageSize`, `resolvePageSize` (URL, then cookie, then 10 on phones and 30 elsewhere) and `pageHolding`, which gives the page that keeps the first book shown in view. `parseShelfFilters` reads `per`, and `shelfHref` keeps it.
     - **Server:** `listShelfPage` takes the size, falls back to 30 for anything not offered, and returns `pageSize`. `loadShelf` decides the size, reading the `shelfPerPage` cookie and `userAgent()`, where `device.type === "mobile"` means a phone.
     - **Deviation:** the plan imagined the server page deciding the size. Since the books now load through the context, `loadShelf` does it, which still keeps the 10-or-30 choice off the client.
     - **UI:** `BooksPerPageSelect` sits beside the page links in `BooksPagination`, where the user placed it. So it shows only when a shelf has more than one page. Choosing a size opens the page that holds the first book shown, and adds `per` to the URL. The shelf tabs, filters and search keep it.
     - **Cookie:** set by a server action, `rememberShelfPageSize`, rather than `document.cookie`, which Biome flags. It's validated, `httpOnly`, lasts a year, and isn't waited for: the URL already carries the choice.
     - **Choices:** sizes are 5, 10, 20, 30 and 50; the user added 5 to the plan's list. "Select all" still stops at 30.
     - **Verified:** typecheck, lint, 598 tests and the build. Tests cover parsing `per` and the cookie, rejecting other sizes, `shelfHref` keeping `per`, the order of URL, cookie and device (using the real `userAgent()` with iPhone and desktop strings), keep-your-place paging, skip, take and page count at each size, and the cookie action.
     - **Not verified:** in the browser signed in. That means the phone and desktop defaults, picking 20, a reload remembering it, and the first book staying in view.
6. **Show the full title on hover** on the shelf cards (`components/pages/books/shelves/BookCard.tsx`).
   - **Today:** `truncateText` cuts titles and authors at 40 characters and adds "...". The full text isn't on the page at all, so long series titles can't be read without opening a dialog.
   - **Cut with CSS instead:** clamp the title to two lines (`line-clamp-2`) and the authors to one (`line-clamp-1`), and remove `truncateText`. The full text then stays on the page, screen readers read all of it, and the cut follows the card's width instead of a fixed count.
   - **Tooltip:** wrap the title in shadcn's `Tooltip` (`components/ui/tooltip.tsx`, already used by `TextField`) showing the full title and authors, on hover and on keyboard focus.
     - Show it only when the text is actually clamped (`scrollHeight > clientHeight`, checked on render and resize), so short titles don't get a useless tooltip.
     - It must not get in the way of selecting: the whole card is a `<label>` that ticks the book's checkbox when clicked. The tooltip only shows text, so clicking still selects.
   - **Phones:** there's no hover on touch screens, so allow three lines there (`line-clamp-3`). The move and edit dialogs already show the full title.
   - **✅ Done (2026-11-14):**
     - **Code:** a new `BookCard/BookTitle.tsx` holds the title and authors. The title and the authors are clamped to one line each, at the user's request (the plan said two lines for the title, three on phones). `truncateText` is gone, so the full text is always on the page.
     - **Tooltip:** shadcn's `Tooltip` shows the full title and authors under the text, on hover and on keyboard focus. It's enabled only while something is actually clamped, measured on mount and with a `ResizeObserver` as the card's width changes.
     - **Inside the card's label:** the trigger is a `<span>`, not a button, so clicking the title still ticks the card's checkbox. It's focusable (`tabIndex=0`) only when clamped, so short titles add no extra Tab stop.
     - **Checked** in the browser on a temporary page, since removed, with the real `BookTitle` inside a card-like label and checkbox: the long *The Boy Who Led Them…* title and its authors are clamped (checked at 2 lines, before the user asked for one); hover and Tab both open the full text; "Dune" has no tooltip and no Tab stop; clicking either title ticks its checkbox; at phone width, no sideways scroll.
     - **Touch screens, after the user found the tooltip didn't open on a phone:** a tap went to the card's label and ticked the checkbox. Now a tap on a cut-off title opens the full text, and a second tap closes it. The click's default is stopped, so the book isn't selected. Tapping elsewhere on the card still selects, and so does tapping a title that isn't cut off. With a mouse, clicking the title still selects. Touch is told apart by the pointer's `pointerType`. Checked on the temporary page with touch pointer events at phone size, and with the mouse on desktop.
     - **Not checked:** on the real shelves while signed in, or on a real phone.
7. **Move to the next date part automatically** in `components/PartialDateField.tsx`. That's the Day / Month / Year inputs in the add form, the move dialog and the edit dialog.
   - **Today:** three plain text inputs, each allowing 4 characters, with no digit filter and no focus movement.
   - **Typing moves forward:**
     - **Day:** after 2 digits, move to Month. Also move after a single digit from 4 to 9, since no day starts with those as two digits.
     - **Month:** after 2 digits, or a single digit from 2 to 9, move to Year.
     - **Year:** takes 4 digits and stays put.
   - **Separators move forward too:** typing `/`, `-`, `.` or a space in Day or Month moves to the next part, so "5/10/2021" can be typed naturally.
   - **Backspace moves back:** in an empty Month or Year it moves to the end of the previous part.
   - **Pasting a whole date** into any part fills all three: `05/10/2021`, `5-10-2021`, `2021-10-05` (year first when the first group has 4 digits), and `10/2021` or `2021` for a partial date. Anything else is pasted as typed.
   - **Only digits:** strip anything else as it's typed, and limit Day and Month to 2 characters and Year to 4.
   - **Never in the way:**
     - Only move after typing at the end of a part, not when editing in the middle or replacing a selection, and not on browser autofill.
     - Tab and Shift+Tab work as before, so a year alone can still be entered by skipping Day and Month, as partial dates allow.
     - The validation of partial dates (`partial-date.rules.ts`) doesn't change.
   - **Structure:**
     - The component becomes a client component (`"use client"`).
     - The decisions go in a pure helper, `components/date-input.ts`, so they can be unit-tested without a browser: when to advance, how a part's text is cleaned, and how a pasted date is split.
8. **Show the read dates on the shelf cards** (`BookCard.tsx`). Today they only appear in the edit dialog.
   - **What's shown,** from the latest read:
     - **Reading:** "Started 5 Oct 2025".
     - **Finished:** "5 Oct 2025 – 12 Nov 2025", or just "Finished Nov 2025" when there's no start date.
     - **DNF:** "Started 5 Oct 2025 · Stopped 20 Oct 2025", with whichever parts are known.
     - **Wishlist and TBR:** no dates.
   - **Partial dates show at their precision:** a year alone as "2024", a month as "Oct 2024", a full date as "5 Oct 2025". Never invent a day. A read with no dates, as after a bulk move, shows nothing rather than "Started —".
   - **Rereads:** when a book has more than one finished read, add "Read 2×" next to the dates.
   - **Data:** `ShelfBook` gets the latest read's dates as structured values (date and precision), not only the form's text. The formatting is a pure, unit-tested helper next to `partial-date.rules.ts`.
9. **Add an audiobook length** for books owned as audiobooks.
   - **Schema:** `UserBook.audioMinutes Int?`, an additive migration (`add_user_book_audio_minutes`). It's per reader, like `UserBook.pageCount`: Open Library and Google Books don't give an audiobook's length, and editions differ.
   - **Forms:** in the add form and the edit dialog, a "Length" field with hours and minutes, shown only when "Audiobook" is ticked. It's optional, and validated as a whole number of minutes from 1 to 12,000 (200 hours). Clearing it in the edit dialog removes it, as with page count.
   - **Shelf card:** an audiobook shows its length ("12 h 30 min") where a book shows its pages.
   - **Later:** Phase 6 uses it for audiobook progress ("time remaining") and for minutes-based goals.
10. **Add another read directly,** for a book read before, or read again, without moving it back to Reading and then to Finished just to record the dates.
    - **Where:**
      - The edit dialog gets a **Reads** section listing every read, newest first. Each shows its outcome and dates, for example "Finished · 5 Oct 2025 – 12 Nov 2025", or "Finished · 2019" for a year alone.
      - The section has an **"Add a read"** button, and the card menu gets an **"Add a past read"** entry that opens the same fields.
    - **Fields:** the outcome (Finished or Did not finish) and optional start and finish dates, using `PartialDateField` (with item 7's auto-advance), so a year or a month alone is fine. Validation follows `partial-date.rules.ts`: no future dates, and no start after the finish when the two periods can't overlap.
    - **Adding a read never changes the book's status or formats.** It only adds a closed read to the history. A book on TBR can carry a read from years ago and stay on TBR, ready for a reread. Earlier reads are never touched.
    - **Only one open read:** adding always creates a *closed* read (outcome Finished or DNF). The current read of a Reading book stays the only open one, and is still started and finished by moving the book.
    - **Editing dates of earlier reads:** each listed read can have its dates corrected in place. Today only the latest read's dates are editable.
    - **"Latest read" must mean the most recent, not the most recently entered.** Today it's the newest row by `createdAt`, in `read-through.model.ts` (`findLatestRead`, `findChangeableReads`) and in the shelf query (`library.model.ts`). A 2019 read added today would then become "latest", replacing the 2024 dates on the card and in the edit dialog.
      - Order by: the open read first, then by end date, then start date, newest first. Reads with no dates go last, then by `createdAt`.
      - The status changes (closing or reopening the current read) must keep acting on the open read, or the latest DNF read, as now. Check that the new order doesn't change which read they pick, and test it.
    - **Removing a read:** not included. Earlier reads are never erased. If a way to remove a read added by mistake is wanted, decide it separately: it would need a confirmation, like deleting a book.
    - **Code:**
      - `addRead(userId, userBookId, { outcome, dates })` and `editReadDates(userId, readId, dates)` in `library.service.ts`, both checking that the book and the read belong to the user.
      - Server actions in `library.controller.ts`, validated with zod in a schema file, never in the `"use server"` file.
      - `createReads` in `read-through.model.ts` already exists, and `updateReadDates` is reused for the edits.
    - **Later:** Phase 6's books-per-year goal counts finished reads by their end date, so a past read counts in its own year, and one with no date doesn't count.
11. **Release:**
   - Bump the version to 2.2.0 in `extension/manifest.json`.
   - Rebuild with `node extension/build.mjs https://<domain>`.
   - Retake any store screenshot that shows the options page or the import dialog.
12. **Tests**, the same way as the Docs-tab fix and the store build:
   - Run the real `app.js` and `options.html` on temporary pages with a stand-in for Chrome's API. Cover: the account shown in the dialog, a 401 and an unreachable site stopping before scraping, batch errors keeping their wording, and the options page in both builds.
   - A visual check of the options page in light and dark.
   - Shelf page size:
     - In `shelf-filters`, parse `per` from the URL and the cookie, rejecting values outside 10/20/30/50, and keep it in `shelfHref`.
     - In the service, skip, take, page count and last page at each size, and keep-your-place paging when the size changes.
     - In the browser, the phone preset (which also sends a phone user-agent) gives 10 by default and the desktop size gives 30. Picking 20 updates the URL, is remembered after a reload and on another shelf, and keeps the first visible book in view. Selection stays capped at 30.
   - Date parts:
     - Unit tests for the helper: advancing after 2 digits and on early single digits, separators, cleaning non-digits, and each pasted form plus junk.
     - In the browser: typing `05102021` without pausing fills Day, Month and Year; Backspace walks back; pasting `2021-10-05` fills all three; a year alone still saves; editing the middle of a part doesn't jump.
   - Adding reads:
     - In the service: adding a finished or DNF read with full, partial or no dates leaves the status and formats unchanged, keeps one open read at most, and rejects another user's book or read and invalid dates.
     - Editing an earlier read's dates.
     - The new "latest read" order: a past read added later doesn't replace the latest dates, and status changes still close or reopen the right read.
     - In the browser: add a 2019 read to a book finished in 2024, and check that the card still shows 2024 and the edit dialog lists both.
   - Read dates on cards: unit tests for the formatter, for each status, each precision, missing dates and rereads, plus a browser check on each shelf.
   - Audiobook length: schema validation (bounds, hours and minutes to minutes, clearing), the field only appearing with Audiobook ticked, and the card showing it.
   - Titles on the shelves, in the browser: a long title (for example *The Boy Who Led Them (The King of Smugglers: …)*) is clamped and shows its full text on hover and on keyboard focus; a short one has no tooltip; clicking a card still selects it; three lines at phone width.
   - The copy button in the browser: the clipboard holds the exact token, the check and the toast show, and the fallback selects the text.
   - Then load both builds in real Chrome.

**Done when:**
- The import dialog names the account and site before you press Import.
- A wrong token stops the import with a clear message and reads nothing.
- The options page shows the logo in its tab and on the page, matches Inkwell's look in light and dark, and links to where tokens are created.
- On `/settings`, one click copies a new token, with visible confirmation.
- A "Books per page" select offers 10, 20, 30 and 50. The choice is kept in the URL and remembered across visits. Without a choice, phones show 10 and desktop 30.
- A clamped title on a shelf card shows its full text on hover or focus, and screen readers read it in full.
- Typing a date moves from Day to Month to Year without pressing Tab, and pasting a full date fills all three parts.
- Shelf cards show when a book was started, and finished or stopped, at the precision that's known.
- An audiobook can have a length, entered in hours and minutes, and the card shows it.
- A read can be added to any book, finished or given up, with full, partial or no dates, without moving the book between lists. The card and the edit dialog keep showing the most recent read.
- The store package rebuilds at version 2.2.0.

## 3f — Purchase dates (after 3e, before Phase 4c)

Added at the user's request on 2026-11-08. Amazon shows when each item was acquired, and the extension doesn't save it today: `UserBook.addedAt` is when the book was added to Inkwell, so the first import gave 139 books the same date. The purchase date is wanted as a shelf filter now, and for the journal in Phase 6.

**Why not reuse `addedAt`:** it orders the shelves (`library.model.ts`), and it means "added to Inkwell" for every book.
- Putting the purchase date there would make it mean "bought" for Amazon books, but "typed in" or "wished for" for the others.
- Filling it on a re-import would reorder the shelves, which the import rules forbid.
- The journal needs both facts, for example "bought in 2019, added in 2026, started in 2027".

So the purchase date gets its own column.

1. **Schema:** add `UserBook.acquiredAt DateTime?` as an additive migration, `add_user_book_acquired_at`.
   - It belongs to the reader, not the shared catalog, because it's their purchase.
   - Store it as a calendar date in UTC, like read dates.
   - It's optional: Wishlist books and books with no known date have none.
2. **One date per book:** a book can be owned in several formats bought on different days. Keep the **earliest** known date, which is when the book first became the reader's. A later, different date never replaces an earlier one.
3. **Extension (`app.js`):** read each row's acquired-date text, sent as `acquiredText` alongside the title and authors.
   - **Needs a real sample first.** The row's HTML structure isn't known, and the text is in the account's language. On amazon.com.br it reads like "Adquirido em 5 de outubro de 2021". Ask the user for one row's outerHTML from the Books tab and one from the Docs tab, with anything private removed.
   - The authors selector, which takes the first `.information_row`, must keep working once a date sits next to it.
4. **Server:**
   - **Parsing:** a pure parser in `imports/acquired-date.rules.ts`, unit-tested, for English and Portuguese month names at least ("October 5, 2021", "5 de outubro de 2021"). Treat the text as untrusted: cap its length, use no backtracking regex, and drop anything that doesn't parse or is in the future.
   - **Validation:** `amazon-import.schema.ts` accepts the new optional field.
   - **New books:** set `acquiredAt` when the import creates the `UserBook`.
   - **Books already in the library:** fill `acquiredAt` only when it's empty or the new date is earlier. Never touch `addedAt`, the status, the dates or the list order, as before. A re-import then gives the books already imported their purchase dates.
5. **Hand-added books:** an optional "Acquired" date in the add form and the edit dialog, using `PartialDateField`, so a year or a month alone is fine.
   - That makes precision necessary: add `acquiredAtPrecision DatePrecision @default(DAY)`, as `ReadThrough` does. Amazon's dates are full days.
   - Leaving the field empty clears it in the edit dialog, as with read dates.
6. **Shelves:**
   - **Filter:** acquired in a year, or acquired before or after a date, kept in the URL like the other filters (for example `?acquired=2024`).
   - **Sort:** a "Purchase date" option next to the default "Newest added". Books with no date sort last.
7. **Not now:** Phase 6 will use `acquiredAt`, for "books bought vs read this year" and "time on TBR before starting". The plan only makes sure the date is there.
8. **Tests:**
   - the parser, for both languages, junk text, future dates and length limits
   - the import, for a new book getting the date, an existing book's empty date filled, an earlier date replacing a later one, a later date never replacing an earlier one, and `addedAt` never changing
   - the schema, the filter and sort in the service and URL parsing, and the form fields
   - the extension on a fake page built from the user's real row HTML

**Done when:**
- Importing from Amazon saves each book's purchase date, and re-importing fills it in for books already imported, without reordering the shelves.
- A book added by hand can have an acquired date, including just a year.
- The shelves can be filtered by acquired year and sorted by purchase date.

## Done when

- A book added manually with no format appears on the Wishlist; ticking a format moves it to TBR.
- Running the extension on the Kindle page adds your ebooks to TBR, and running it again adds nothing new.
- A book owned as physical and then imported shows both formats, once, on TBR.
- Changing a book's status moves it to the matching list, and earlier reads stay in its history.
- Moving many books at once to Finished works, and records no invented dates.
- Filtering by format and searching work on all five lists.
- Type check, lint, tests and build pass, and one user can't see another's books.

### Checked (2026-11-08)

The user ran six steps by hand, signed in. The local database was then read, without changing anything, for evidence of each, and the services were run against it with two throwaway users, since removed.

| Done when | Result |
|---|---|
| Manual add with no format goes to the Wishlist, and ticking a format moves it to TBR | ✅ The user confirmed it in the UI. *A Little Princess* was added by hand with no format and is on the Wishlist. |
| The extension adds ebooks to TBR, and running it again adds nothing new | ✅ 139 books were imported on Nov 1. A service re-run reported 0 new, and the user confirmed the extension's own count. |
| Physical, then imported, shows both formats once on TBR | ✅ By the service: one book with Physical and Ebook, on TBR. The user confirmed it on the real page. |
| A status change moves the book and earlier reads stay | ✅ *Business Not As Usual* has 3 reads and *Classic Works from Women Writers* has 2, all kept. A service reread kept the first read. |
| A bulk move to Finished records no invented dates | ✅ *Did You Miss Me?* and *The Commoner* got Finished reads in the same instant, with no dates. The service run matched. |
| Format filters and search work on all five lists | ✅ Confirmed by the user in the UI, including paging through a filtered TBR list. |
| Checks pass, and one user can't see another's books | ✅ Typecheck, lint, 509 tests and build pass. Against the database, user B got nothing for user A's book: no `get` result, a shelf total of 0, and "not found" for status, formats, edit and delete. Bulk moves and deletes skipped it, and A's book was unchanged. The same private document imported by two users became two private copies. |

**Docs tab, found during the check and since fixed:** the extension sent a run from Amazon's Docs tab as ordinary books, not as private documents. `app.js` treats a page as the Docs tab only when its path contains `/hz/mycd/digital-console/contentlist/pdocs`, which wasn't true on the real page. The 24 documents in that run, with titles like `the_shining` and `1_-_Twilight_-_Stephenie_Meyer`, matched catalog entries created on Nov 1, before private documents existed. So they were re-added as shared books. No other user has them. - **Fix, in `extension/app.js`:** the import dialog now asks whether the page lists Books or Docs ("kept private"). It pre-selects a guess from the address: `/pdocs/` or `/docs/` as a path segment means Docs. The real address is no longer trusted on its own, because it didn't match on the real page and Amazon can change it. Tested with the real `app.js` on a fake content page and a stand-in for Chrome's API:
  - A Books address pre-selects Books and sends `books`, with the ASIN found.
  - `/pdocs/` pre-selects Docs and sends `docs`.
  - An unknown address defaults to Books, and picking Docs by hand sends `docs`.
  - Cancel sends nothing.
- **Still to do:** run it once on the real Docs tab, choosing Docs, and check that the documents arrive as private books.
- **Still to decide:** whether to turn the Nov 1 documents into private books. That changes data, so it needs the user's go-ahead.
- Also fixed: a malformed closing tag in `extension/options.html` (`<output/>` instead of `</output>`).

**Also found:** 80 of the 230 Amazon catalog books have no ASIN, so a re-import can only match them by title and author. They're probably from before ASIN capture.
