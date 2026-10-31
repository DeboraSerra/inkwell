# Phase 2 — Data model redesign (built to scale)

[← Plan overview](README.md)

Split the **shared book catalog** from **your relationship to each book**. Right now `Book.title @unique` and the book's status sit on the shared `Book` row, so two users can't have different statuses for the same book.

```
Book            (shared catalog)  id, title, subtitle, authors[], isbn10?, isbn13? @unique,
                                  asin? @unique, openLibraryId?, googleBooksId?, coverUrl,
                                  pageCount?, lengthCategory?, publishedYear?, description?,
                                  tags[], aiEnrichedAt?, metadataSource
Genre / Trope   (curated, seeded) many-to-many with Book (BookGenre, BookTrope)
ApiToken        userId, tokenHash, prefix, name, lastUsedAt, revokedAt

UserBook        userId, bookId (unique together), status, source, addedAt, updatedAt
```

**Phase 3a changes part of what this phase built:** `UserBook.ownership` becomes a multi-value `formats` column, and the shelves are removed because `status` defines the lists. The sections below record what was built at the time; [Phase 3](phase-3-mvp.md) is the current model.

Why it's shaped this way:
- The catalog fills in each book (metadata and AI) **once**, and every user reuses it.

## Sub-phases

| Step | Scope | Status |
|---|---|---|
| [2a — Catalog](#phase-2a--catalog) | Migration reset, `Book` reshape, genres/tropes join tables, dedupe keys, Vitest | ✅ |
| [2b — Library](#phase-2b--library) | `UserBook` with status and source, status transitions, user-scoped data access | ✅ |
| [2c — Shelves](#phase-2c--shelves) | `Shelf`/`ShelfItem`, system shelves per user, ordering | ✅ (removed by 3a) |

The journal and goals steps that used to be 2d and 2e moved to [Phase 6](phase-6-journal.md).

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

**Status: ✅ Implemented on `dev`, not committed.**

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

### Outcome

- **Schema:** `Shelf`, `ShelfItem`, and the enums `ShelfKind` and `SystemShelfType`; migration `20261030010000_add_shelves`. The migration also backfills shelves and items for existing users, so no separate one-off script is needed.
- **Module, `src/server/shelves/`:** `shelf.rules.ts` (placement and positions), `shelf.model.ts`, and `shelf.service.ts` (`ensureSystemShelves`, `syncSystemShelf`, `appendToShelf`, `moveItem`).
- **Wiring:** `createSession` calls `ensureSystemShelves`. `addBookToLibrary`, `updateStatus` and `updateOwnership` call `syncSystemShelf` in the same transaction. If a user's shelves are missing, the sync creates them.
- **`moveItem(shelfItemId, beforeId?, afterId?)`:** `beforeId` is the item that ends up right before the moved one, and `afterId` the one right after. With only one given, the other side is looked up.
- **Additions to the plan:**
  - `@@unique([userId, systemType])`, so a user can't get a duplicate system shelf.
  - `createUserBook` now uses `ON CONFLICT DO NOTHING`, because catching a unique-key error would abort the surrounding transaction.
- **Decisions to review:**
  - As planned, `AUDIO` + `TO_READ` belongs on no system shelf, so unread audiobooks aren't on any list yet.
  - A book that leaves a shelf and comes back goes to the end; its old position isn't kept.
  - Concurrent moves can tie on position; ties are ordered by id, and the next renumber clears them.
- **Not built:** reading a shelf's books (Phase 6 needs it) and controllers (no UI calls these yet).
- **Verified:** 181 tests; against the local database with throwaway rows (repeat and concurrent shelf creation, every shelf move, 5 concurrent adds of one book, renumbering, cross-user blocking, custom shelves untouched); the backfill SQL inside a rolled-back transaction. A real Google sign-in wasn't run, so `createSession` calling `ensureSystemShelves` is covered by a unit test only.
