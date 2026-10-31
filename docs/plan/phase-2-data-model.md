# Phase 2 — Data model redesign (built to scale)

[← Plan overview](README.md)

Split the **shared book catalog** from **your relationship to each book**. Right now `Book.title @unique` and the book's status sit on the shared `Book` row, so two users can't have different statuses for the same book.

```
Book            (shared catalog)  id, title, subtitle, authors[], isbn10?, isbn13? @unique,
                                  asin? @unique, openLibraryId?, googleBooksId?, coverUrl,
                                  pageCount?, lengthCategory?, publishedYear?, description?,
                                  tags[], aiEnrichedAt?, metadataSource
Genre / Trope   (curated, seeded) many-to-many with Book (BookGenre, BookTrope)

UserBook        userId, bookId (unique together)
                ownership: EBOOK | PHYSICAL | AUDIO | NONE      // NONE + WISHLIST shelf = wishlist
                status:    WISHLIST | TO_READ | READING | FINISHED | DNF
                source:    AMAZON_IMPORT | SEARCH | ISBN | MANUAL
                priority/position (for TBR ordering), addedAt, startedAt?, finishedAt?
Shelf           userId, name, kind: SYSTEM | CUSTOM            // system shelves: Ebook TBR,
ShelfItem       shelfId, userBookId, position                 // Physical TBR, Wishlist; custom ones later

ReadingSession  userBookId, date, startPage?/endPage?/percent?, minutes?, note?, mood?
Review          userBookId @unique, rating (half stars), body?, favoriteQuote?, finishedAt
ReadingGoal     userId, metric: BOOKS | PAGES | MINUTES, period: YEAR | MONTH | CUSTOM,
                startDate, endDate, target       // default: BOOKS / YEAR
ImportJob       userId, source, status, totals, createdAt     // audit + sync results
ApiToken        userId, tokenHash, prefix, name, lastUsedAt, revokedAt   // ✅ built in Phase 1
```

Why it's shaped this way:
- The three lists are system `Shelf` rows instead of hard-coded enums, so custom shelves ("Summer reads") cost nothing to add later.
- The status and ownership enums are what the lists filter on. A wishlist book you buy simply changes ownership and moves to a TBR shelf.
- The catalog fills in each book (metadata and AI) **once**, and every user reuses it.
- Goal progress is computed from `UserBook.finishedAt` and `ReadingSession`. It isn't stored, so it can't drift.

## Sub-phases

Phase 2 is split into five steps, described below. Each ends with a migration that applies cleanly, a passing build, and a working app, so you can stop between any two.

| Step | Scope | Depends on |
|---|---|---|
| [2a — Catalog](#phase-2a--catalog) | Migration reset, `Book` reshape, genres/tropes join tables, dedupe keys, Vitest | — |
| [2b — Library](#phase-2b--library) | `UserBook` with status/ownership/source, status transitions, user-scoped data access | 2a |
| [2c — Shelves](#phase-2c--shelves) | `Shelf`/`ShelfItem`, system shelves per user, ordering | 2b |
| [2d — Journal](#phase-2d--journal) | `ReadingSession`, `Review`, the finish-a-book flow | 2b |
| [2e — Goals and imports](#phase-2e--goals-and-imports) | `ReadingGoal` with computed progress, `ImportJob` | 2b (2d for page/minute goals) |

2c and 2d are independent, so they can be done in either order. Phases 3 and 4 need 2a–2c; Phase 6 needs all of them.

---

## Phase 2a — Catalog

**Status: ✅ Implemented on `dev`, not committed.**

Goal: a shared `Book` catalog that can be deduplicated reliably, so imports and searches never create the same book twice.

### Steps

1. **Reset migrations.** Delete the existing migration folders (three from May, plus `20261009220000_add_api_tokens`). Generate a single new `init` migration from the redesigned schema, keeping the `User` and `ApiToken` models from Phase 1 unchanged. Reset the local database with `prisma migrate reset`. There's no production data yet, so nothing is lost.
2. **Remove the old models:** `Status`, `Review`, `UserBooks`, and the `status`/`trope`/`genre` foreign keys and `Book.title @unique`. These come back per user in 2b and 2d.
3. **Reshape `Book`:**
   - Fields: `title`, `subtitle?`, `authors String[]`, `isbn10?`, `isbn13? @unique`, `asin? @unique`, `openLibraryId?`, `googleBooksId?`, `coverUrl?`, `pageCount?`, `lengthCategory?` (enum `SHORT | MEDIUM | LONG`), `publishedYear?`, `description?`, `tags String[]`, `aiEnrichedAt?`, `metadataSource` (enum `AMAZON | OPEN_LIBRARY | GOOGLE_BOOKS | MANUAL`).
   - `dedupeKey String` with an index: the normalized title plus the first author (see step 5). Not unique, because different editions can share it.
4. **Many-to-many genres and tropes:** explicit `BookGenre` and `BookTrope` join tables with a `source` column (`AI | USER`), so Phase 5 can tell AI suggestions from your edits.
5. **Dedupe helper, `src/server/books/dedupe.ts`:**
   - `normalizeTitle`: lowercase, strip accents and punctuation, drop subtitles after `:`, and remove series markers like "(Book 2)".
   - `dedupeKey(title, authors)`.
   - `findExistingBook({ asin, isbn13, isbn10, title, authors })`: match on ASIN, then ISBN, then dedupe key.
6. **Make the seed idempotent:** `upsert` genres and tropes by name instead of `create`, so it can run repeatedly. Delete `assets/lists/status.ts`; statuses become an enum in 2b.
7. **Add Vitest** (`npm run test`) with unit tests for `normalizeTitle`, `dedupeKey` and the ISBN-10 → ISBN-13 conversion.

### Done when

- `prisma migrate reset` applies the single `init` migration and seeds without errors, and running the seed a second time changes nothing.
- The dedupe tests pass, covering edge cases such as "The Hobbit" vs "Hobbit, The" and the same title with different subtitles.
- `npm run build` passes. Sign-in and API tokens from Phase 1 still work.

### Outcome

- **Migration reset:** a single migration, `20261010000000_init`. The old folders are gone, including `20260523195247_create`, which had no SQL file and had left an orphaned `FileHashes` table. The local database was reset with your consent and now matches the schema with no drift.
- **Schema:** `Book` reshaped, with `@@index` on `dedupeKey` and `isbn10`; new `BookGenre`/`BookTrope` join tables that carry a `source`; enums `LengthCategory`, `MetadataSource` and `TagSource`. `Status`, `Review` and `UserBooks` were removed. `User` and `ApiToken` are unchanged.
- **Helpers:** `src/server/books/isbn.ts` handles ISBN validation and conversion. `src/server/books/dedupe.ts` holds `normalizeTitle`, `normalizeAuthor` (reduces a name to the surname) and `dedupeKey`. The database lookup `findExistingBook` lives in `src/server/books/book.service.ts` (queries in `book.model.ts`), so the pure helpers can be tested without loading Prisma.
- **Seed:** upserts by name and is safe to re-run (28 genres, 71 tropes). `assets/lists/status.ts` was removed.
- **Tests:** Vitest 5 with `npm test` and `npm run test:watch`; 29 tests. `@types/node` was bumped to ^24 to match Node 24, which Vitest 5 requires.
- **Later refactor:** these files now live in `src/server/books/`; see the architecture note in the plan README.
- **Choices to review:** leading articles are stripped in English and Portuguese ("the/a/an/o/os/as/um/uma"). All parenthesized and bracketed text in titles is dropped.

---

## Phase 2b — Library

**Status: ✅ Implemented on `dev`, not committed.**

Goal: your own relationship with each book (status, format, dates), separate from the shared catalog.

### Steps

1. **`UserBook` model:**
   - Fields: `userId`, `bookId`, `@@unique([userId, bookId])`, `addedAt`, `startedAt?`, `finishedAt?`, `updatedAt`.
   - `ownership`: `EBOOK | PHYSICAL | AUDIO | NONE`. `NONE` means you don't own the book, i.e. it's on the wishlist.
   - `status`: `WISHLIST | TO_READ | READING | FINISHED | DNF`.
   - `source`: `AMAZON_IMPORT | SEARCH | ISBN | MANUAL`.
   - Indexes on `(userId, status)` and `(userId, finishedAt)` for list filters and goal queries.
   - Cascade-delete from `User`. Restrict deletes from `Book`, since a catalog book is never deleted while someone owns it.
2. **Status transitions, `src/server/library/status.rules.ts`.** One pure function decides which date fields change:
   - → `READING` sets `startedAt`, unless you're re-entering after DNF.
   - → `FINISHED` sets `finishedAt` (and `startedAt` too if it was empty).
   - → `TO_READ` from `FINISHED` is a reread; for now it clears `finishedAt`. Proper reread history is listed under "Later".
   - Buying a wishlist book moves `ownership` from `NONE` to `EBOOK`/`PHYSICAL` and the status from `WISHLIST` to `TO_READ`.
3. **Library service and model, `src/server/library/library.service.ts` and `library.model.ts`:** `addBookToLibrary`, `updateStatus`, `updateOwnership`, `getUserBook`, `listUserBooks(filters)`.
   - Every function takes `userId` as its first argument, and no query runs without it.
   - `addBookToLibrary` is idempotent: if the book is already in your library, it returns the existing row unchanged. This is the re-import behaviour Phase 3 relies on.
4. **Tests:** status-transition unit tests, plus one test checking that every query function filters by `userId`.

### Done when

- The transition tests cover every valid status pair, and invalid ones are rejected.
- Adding the same book twice for the same user gives one `UserBook`. Adding it for two users gives two.
- `npm run build` passes.

### Outcome

- **Schema:** `UserBook` plus the enums `Ownership`, `ReadingStatus` and `UserBookSource`; migration `20261010010648_add_user_books` (additive). The status was later renamed in place, so existing rows keep their value: `WANT_TO_READ` → `WISH_TO_READ` (migration `20261010020000_rename_want_to_read_to_wish_to_read`), then → `WISHLIST` (migration `20261030000000_rename_wish_to_read_to_wishlist`). Deleting a `User` cascades to their books; deleting a `Book` is restricted while any library holds it.
- **Status rules, `src/server/library/status.rules.ts`:** `transitionStatus`, `canTransition`, `changeOwnership`, `initialState` and `unreadStatusFor`. These decisions weren't fixed in the plan:
  - "Unread" depends on ownership: `WISHLIST` if you don't own the book, `TO_READ` if you do. An unread status that contradicts ownership is rejected.
  - Allowed moves: unread → `READING`/`FINISHED`; `READING` → `FINISHED`/`DNF`/unread; `FINISHED` → `READING` (a reread, which starts fresh) or unread; `DNF` → `READING` (resumes, keeping `startedAt`) or unread. `DNF` → `FINISHED` must go through `READING`.
  - `DNF` keeps `startedAt` and leaves `finishedAt` empty, so DNF books never count toward goals.
  - Every transition takes an optional `at` date for recording past events. `initialState` can add a book that's already finished or DNF.
- **Service and model, `src/server/library/library.service.ts` / `library.model.ts`:** `addBookToLibrary`, which returns `{ userBook, created }` (Phase 3 uses `created` for import counts) and handles concurrent inserts; `getUserBook`; `listUserBooks`, which filters by status, ownership, source and search, uses cursor pagination capped at 100, and searches the title or the first author's surname through `dedupeKey`; `updateStatus` and `updateOwnership`, each running in a transaction.
- **Tests:** 106 in total. Includes the full status × status table for owned and unowned books, plus scoping tests that use a recording fake of Prisma. Vitest now stubs `server-only` (now at `src/server/tests/stubs/server-only.ts`).
- **Checked against the local database** with throwaway rows: re-adding is idempotent, two users get two rows, another user can't read or update your book, and a catalog book can't be deleted while it's in a library.

---

## Phase 2c — Shelves

Goal: the three lists (Ebook TBR, Physical TBR, Wishlist) stored as data, so custom shelves are cheap to add later.

### Steps

1. **Models:**
   - `Shelf`: `userId`, `name`, `slug`, `kind` (`SYSTEM | CUSTOM`), `systemType?` (`EBOOK_TBR | PHYSICAL_TBR | WISHLIST`), `@@unique([userId, slug])`.
   - `ShelfItem`: `shelfId`, `userBookId`, `position`, `addedAt`, `@@unique([shelfId, userBookId])`, index on `(shelfId, position)`.
2. **System shelves per user.** `ensureSystemShelves(userId)` creates the three shelves if they're missing. Call it from `createSession` in `src/server/auth/auth.service.ts` right after the `User` upsert (through the shelves service, not its model), and run it once for users who already exist.
3. **Placement rules, `src/server/shelves/shelf.rules.ts`** (with `shelf.model.ts` and `shelf.service.ts` alongside). A function maps `(ownership, status)` to a system shelf:
   - `EBOOK` + `TO_READ` → Ebook TBR.
   - `PHYSICAL` + `TO_READ` → Physical TBR.
   - `NONE` + `WISHLIST` → Wishlist.
   - Any other combination (reading, finished, DNF) → no system shelf.
   
   The 2b status and ownership helpers call it inside the same transaction, so shelves never disagree with status.
4. **Ordering.** Use sparse integer positions (steps of 1024) so a drag-to-reorder updates one row. Re-number a shelf only when a gap runs out. Helpers: `moveItem(shelfItemId, beforeId?, afterId?)` and `appendToShelf`.
5. **Tests:** the placement rules, buying a wishlist book (it moves from Wishlist to a TBR shelf), and reordering, including a gap running out.

### Done when

- Signing in creates exactly three system shelves, and signing in again creates no duplicates.
- Changing status or ownership always leaves the book on the correct shelf.
- `npm run build` passes.

---

## Phase 2d — Journal

Goal: the journal itself, with dated reading log entries and a review when you finish.

### Steps

1. **`ReadingSession` model:**
   - Fields: `userBookId`, `date` (date only), `startPage?`, `endPage?`, `percent?` (0–100), `minutes?`, `note?`, `mood?` (small enum or emoji string), `createdAt`.
   - Index on `(userBookId, date)`.
   - Validation: at least one of pages, percent, minutes or note must be set, and `endPage >= startPage`.
2. **`Review` model:**
   - Fields: `userBookId @unique`, `rating` (integer 1–10, displayed as half stars), `body?`, `favoriteQuote?`, `createdAt`, `updatedAt`.
   - A rating can only be added when the status is `FINISHED` or `DNF`.
3. **Progress helper:** `getProgress(userBook)` returns the latest page or percent from the sessions, and converts pages to a percent when `Book.pageCount` is known.
4. **Finish-a-book flow:** one service function sets the status to `FINISHED` (through the 2b transition) and optionally creates the review and a final reading session, all in one transaction.
5. **Data access:** `logSession`, `updateSession`, `deleteSession`, `listSessions(userBookId)`, `upsertReview`. Each one checks that the `UserBook` belongs to the user.
6. **Tests:** session validation, progress calculation (pages vs percent, unknown page count), and that the finish flow is atomic.

### Done when

- You can log progress, finish a book with a review, and see the progress value the UI will show, all from tests or a script.
- `npm run build` passes.

---

## Phase 2e — Goals and imports

Goal: flexible reading goals with progress that's always computed, plus a record of each import so Phase 3 can report "42 new, 310 already in library".

### Steps

1. **`ReadingGoal` model:**
   - Fields: `userId`, `metric` (`BOOKS | PAGES | MINUTES`), `period` (`YEAR | MONTH | CUSTOM`), `startDate`, `endDate`, `target`, `createdAt`.
   - Index on `(userId, startDate, endDate)`. Overlapping goals are allowed, for example a yearly books goal alongside a monthly pages goal.
2. **Default goal.** On first sign-in, or the first visit in a new year, suggest (don't create) a `BOOKS / YEAR` goal for the current year. The UI in Phase 6 confirms it.
3. **Progress, `src/server/goals/progress.rules.ts`** (queries in `goal.model.ts`, orchestration in `goal.service.ts`). Computed, never stored:
   - `BOOKS`: the number of `UserBook`s with `finishedAt` inside the goal's dates.
   - `PAGES`: pages read in the range, from the sessions. Falls back to `pageCount` for books finished with no sessions.
   - `MINUTES`: the sum of `ReadingSession.minutes` in the range.
   - Also returns "on track / behind" by comparing progress with the share of the period that has passed.
4. **`ImportJob` model:**
   - Fields: `userId`, `source` (`AMAZON`), `status` (`PENDING | COMPLETED | FAILED`), `totalCount`, `createdCount`, `skippedCount`, `error?`, `createdAt`, `completedAt?`.
   - Helpers `startImport` and `completeImport`, ready for the Phase 3 endpoint.
5. **Tests:** progress for each metric, including edge cases like books finished on the period boundaries and timezones (store dates as UTC calendar dates), and on-track math.

### Done when

- The goal progress tests pass for all three metrics.
- `npm run build` passes and the Phase 2 schema matches the overview.
