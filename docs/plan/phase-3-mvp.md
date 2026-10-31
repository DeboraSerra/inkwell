# Phase 3 — MVP: add books and browse them

[← Plan overview](README.md)

**Status: in progress.** 3a is implemented on `dev`, not committed; 3b is next. This is the current focus. Everything after it waits until it's done.

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

- **Schema:** migration `20261030020000_formats_and_read_history` adds `formats` and `ReadThrough`, moves existing dates into reads, and drops `ownership`, `startedAt`, `finishedAt` and the shelf tables.
- **Code:** `status.rules.ts` is rewritten around formats and read changes; `read-through.model.ts` is new; `library.service.ts` gains `updateFormats` and `updateStatuses`; `src/server/shelves/` is gone.
- **Choices the plan left open:**
  - A book added or moved straight to Finished gets an end date but no start date, rather than an invented one.
  - A bulk move runs in a fixed number of queries, so it fits in one transaction.
- **Verified:** tests; the migration over sample rows of every kind in a rolled-back transaction; 21 checks on the local database with throwaway rows.

## 3b — Add books manually

1. `addManualBook` in the books and library services: find the catalog book with `findExistingBook`, or create it, then add it to the library. Both happen in one transaction.
2. Controller with input validation using zod (approved as a new dependency): title and at least one author required; subtitle, cover URL, page count and ISBN optional.
3. Add-book form: the catalog fields, plus checkboxes for ebook, physical and audiobook. **No format ticked means Wishlist.**

## 3c — Add books through the extension

1. **Extension:**
   - Keep the scraper and also capture the **ASIN** (from the row's id or link) for reliable deduplication.
   - Replace the clipboard copy with `POST {APP_URL}/api/imports/amazon`.
   - Add an options page for the app URL and API token, with progress and a result message ("42 new, 310 already in library").
2. **`manifest.json`:** run the content script only on `https://www.amazon.*/hz/mycd/*`, with `host_permissions` for the app URL.
3. **Route handler:** authenticate with `getRequestUser`, validate the payload with a size limit, and treat every scraped field as untrusted. Upsert `Book` rows (ASIN → ISBN → dedupe key), add each to the library with `EBOOK` and source `AMAZON_IMPORT`, and return the created and existing counts.

## 3d — Browse, filter and move books

1. **`/` (books page):** tabs for Wishlist, TBR, Reading, Finished and DNF, showing cover, title, authors and format badges.
2. **Filters:** owned format (physical, audio, digital; any combination) and search by title or author, on every list. Keep the list and filters in the URL's query string, so they survive a refresh and can be bookmarked.
3. **Change status** on each book, through a controller that calls `updateStatus`, so it follows the status rules.
   **Bulk move:** select up to 30 books and move them to another list. This is how you clear already-read ebooks from TBR after the first import. Limited to 30 books at a time, and the result says how many moved and how many were skipped.
4. **Edit formats** on each book, so a wishlist book can become owned and move to TBR.
5. **Pagination:** "Load more" using the cursor. Show an empty state on each list.
6. **Covers:** allow only the image hosts actually needed, in `images.remotePatterns`.
7. Mobile-first, with `dark:` variants.

## Done when

- A book added manually with no format appears on the Wishlist; ticking a format moves it to TBR.
- Running the extension on the Kindle page adds your ebooks to TBR, and running it again adds nothing new.
- A book owned as physical and then imported shows both formats, once, on TBR.
- Changing a book's status moves it to the matching list, and earlier reads stay in its history.
- Moving many books at once to Finished works, and records no invented dates.
- Filtering by format and searching work on all five lists.
- Type check, lint, tests and build pass, and one user can't see another's books.
