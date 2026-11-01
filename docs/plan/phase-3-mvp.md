# Phase 3 — MVP: add books and browse them

[← Plan overview](README.md)

**Status: in progress.** 3a and 3b are done, and 3c is implemented on `dev`, not committed; 3d is next. This is the current focus. Everything after it waits until it's done.

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

## Done when

- A book added manually with no format appears on the Wishlist; ticking a format moves it to TBR.
- Running the extension on the Kindle page adds your ebooks to TBR, and running it again adds nothing new.
- A book owned as physical and then imported shows both formats, once, on TBR.
- Changing a book's status moves it to the matching list, and earlier reads stay in its history.
- Moving many books at once to Finished works, and records no invented dates.
- Filtering by format and searching work on all five lists.
- Type check, lint, tests and build pass, and one user can't see another's books.
