# Phase 4 — Search and ISBN

[← Plan overview](README.md)

**Status: in progress.** 4a and 4b are done and committed. ✅ 4c is done (2026-11-15), checked by the user; its synopsis follow-up is built. ⏭️ Next is 4d. Phase 3 closed on 2026-11-15 ([phase-3-mvp.md](phase-3-mvp.md#closed-2026-11-15)). Phase 4 was started at the user's request before Phase 3's "Done when" list was checked.

Goal: add a book without typing its details. Search by title or author, type an ISBN, or photograph the barcode, then confirm, pick formats and add. The manual form stays as the last resort.

## What already exists

- **Schema:** `Book.openLibraryId`, `googleBooksId`, `publishedYear` and `description`; `MetadataSource.OPEN_LIBRARY` and `GOOGLE_BOOKS`; `UserBookSource.SEARCH` and `ISBN`. The only migration is the rate-limit table (4a, step 7).
- **ISBN helpers** in `books/isbn.ts` (`cleanIsbn`, `isValidIsbn13`, `toIsbn13`, `formatIsbn`), and **dedupe** in `books/dedupe.ts` and `findExistingBook` (ASIN → ISBN → `dedupeKey`).
- **Adding:** `addBookToLibrary` already applies the format and status rules, and only adds formats to a book already in the library. The status and read-date fields from the manual form (`StatusField`, `PartialDateField`, `parseReadDates`) can be reused as they are.
- `src/app/api/books/route.js` is an empty leftover file and gets deleted.

## Out of scope

AI genres, tropes and length (Phase 5). Choosing between editions of a work beyond what a search returns. Scanning many books into a queue (see "Later" at the end). Importing from Goodreads.

## 4a — Metadata providers (server)

A new module, `src/server/metadata/`, that turns an ISBN or a search query into book details. It touches no user data, so its functions take no `userId`.

1. **Shared shape,** `metadata.types.ts`:

   ```ts
   type BookMetadata = {
     source: "OPEN_LIBRARY" | "GOOGLE_BOOKS";
     sourceId: string;          // OL edition key ("OL123M") or Google volume id
     title: string;
     subtitle?: string;
     authors: string[];
     isbn13?: string;
     isbn10?: string;
     coverUrl?: string;         // https only
     pageCount?: number;
     publishedYear?: number;
     description?: string;      // plain text
   };
   ```

2. **Providers,** one file each, `open-library.provider.ts` and `google-books.provider.ts`, each exporting `lookupIsbn(isbn13)` and `search(query, limit)`. They're the module's I/O layer, the counterpart of a model: they fetch and parse, with no business rules.
   - **Open Library:**
     - ISBN: `GET https://openlibrary.org/api/books?bibkeys=ISBN:{isbn}&format=json&jscmd=data`. This returns author names directly, unlike `/isbn/{isbn}.json`, which returns author keys that need more requests.
     - Search: `GET https://openlibrary.org/search.json?q=…&fields=key,title,subtitle,author_name,isbn,cover_i,number_of_pages_median,first_publish_year,edition_key&limit=…`.
     - Covers: `https://covers.openlibrary.org/b/id/{cover_i}-M.jpg`.
     - Open Library asks API clients to send a `User-Agent` naming the app and a contact. That's read from a new server-only env var, `METADATA_USER_AGENT`, so no personal address goes in the code.
   - **Google Books:**
     - ISBN: `GET https://www.googleapis.com/books/v1/volumes?q=isbn:{isbn}`.
     - Search: `q=intitle:…+inauthor:…`, or the plain query.
     - It works without a key on a small shared quota. With `GOOGLE_BOOKS_API_KEY` (server-only, optional) the quota is per project.
     - Image links come as `http://`; rewrite them to `https://` or drop them.
3. **Treat every response as untrusted:**
   - Parse it with zod.
   - Cap lengths: title 500, author 200 and at most 25 authors (matching the manual form), description 5,000.
   - Keep `https` cover URLs only, from an allowlist of `covers.openlibrary.org` and `books.google.com`.
   - Validate ISBNs with the existing helpers.
   - Google's descriptions contain HTML. Strip tags with a linear scan, not a backtracking regex, or drop the description.
   - A response that fails to parse counts as "not found", not as an error shown to the user.
4. **Time limits:** every request uses `AbortSignal.timeout(5000)`. A timeout or a 5xx counts as a miss for that provider, and the next one is tried.
5. **Service,** `metadata.service.ts`:
   - `lookupIsbn(isbn)`:
     1. Clean and validate the ISBN, turning ISBN-10 into ISBN-13. An invalid one throws `ValidationError`.
     2. **Check the catalog first** with `findExistingBook({ isbn13 })`, with no network call. Other users' private books are excluded.
     3. Otherwise ask Open Library, then Google Books if it misses.
     4. **Fill gaps:** when Open Library finds the book but has no cover or no page count, ask Google Books for the same ISBN and take only those missing fields. Everything else stays as Open Library had it. If Google fails, the Open Library result is used as it is.
     5. Return `{ found: "catalog", book } | { found: "provider", metadata } | { found: "none" }`.
   - `searchBooks(query)`:
     - The query is trimmed and must be 3 to 200 characters.
     - It returns at most 10 results from Open Library, falling back to Google Books when Open Library returns nothing or fails.
     - **All languages** are shown; there's no language filter. Gaps aren't filled in search results, only when a book is added.
     - Results that match a catalog book by ISBN are marked, so the UI can show "In your library" without a second request.
6. **Caching,** following the original plan's "results are cached in the `Book` table":
   - A **book is written to the catalog only when someone adds it,** not on every lookup or search. Otherwise the shared catalog would fill with books nobody has.
   - Once it's in the catalog, `lookupIsbn` finds it there and makes no network call.
   - Provider responses are also cached briefly (a day) so retyping the same ISBN or query doesn't hit the APIs again. Read `node_modules/next/dist/docs/` on caching before choosing between `fetch` options and `"use cache"` in Next 16.
7. **Rate limit,** per user, on lookup and search, so a runaway client (or a leaked API token) can't burn the providers' quotas:
   - **Limits:** 60 ISBN lookups and 60 searches a minute per user. Search is debounced, so normal typing stays well under it.
   - **Counted in Postgres,** because Vercel instances don't share memory. New model `RateLimit` (`userId`, `bucket`, `windowStart`, `count`), unique on `userId + bucket`, with a cascade delete from `User`. Migration `add_rate_limit`.
   - **One atomic query per request,** in `rate-limit.model.ts`: an `INSERT … ON CONFLICT (user_id, bucket) DO UPDATE` that resets the count to 1 when the window is over a minute old and adds 1 otherwise, returning the new count. There's one row per user per bucket, so the table never grows.
   - **Service,** `src/server/rate-limit/rate-limit.service.ts`: `consume(userId, bucket, limit)` throws a new `RateLimitError extends DomainError` past the limit. `domainErrorResponse` maps it to `429` with a `Retry-After` header, and server actions show "Too many lookups. Try again in a minute."
   - Called from the metadata controllers (4b, 4c) before any lookup, including catalog hits, so the limit is simple to reason about.
8. **Tests,** in `src/server/tests/`:
   - Each provider's parser against saved JSON fixtures (found, not found, missing fields, `http` cover, HTML description, junk). No network in tests.
   - The service with the providers and the book model mocked: catalog hit skips the network, Open Library miss falls back to Google, a missing cover or page count is filled from Google and nothing else is, both down returns `none`, an invalid ISBN throws, and private books are never returned.
   - The rate limit: under the limit, at the limit, past it, a new window resetting the count, and two users not sharing a count. The model's SQL is checked once against the local database.

### 4a outcome

- **Code:**
  - `src/server/metadata/`:
    - `metadata.types.ts`: `BookMetadata` and the provider interface.
    - `sanitize.ts`: pure cleaners for every field.
    - `http.ts`: `fetchProviderJson` and `ProviderError`.
    - `open-library.provider.ts` and `google-books.provider.ts`.
    - `metadata.service.ts`: `lookupIsbn`, `searchBooks`, `parseIsbn` and `parseQuery`.
  - `src/server/rate-limit/`: `rate-limit.model.ts` and `rate-limit.service.ts` (`consumeRateLimit`).
  - `RateLimitError` in `errors.ts`, mapped to `429` with `Retry-After`.
- **Schema:** model `RateLimit` (composite key `userId + bucket`, cascade from `User`), migration `20261108120000_add_rate_limit`. It's applied to the local database.
- **Caching:** providers call `fetch` with `next: { revalidate: 86400 }`. That's Next's data cache, per `node_modules/next/dist/docs` for apps without Cache Components. The 5-second timeout `signal` only turns off per-render memoization, not this cache. Only `200` responses are stored, so a miss from Open Library (`{}`, a 200) is also remembered for a day.
- **Choices the plan left open:**
  - zod checks each response's structure, and the sanitize helpers check each value. An odd field (a string page count, an unknown cover host) is dropped and the rest of the book kept.
  - Every field is marked optional in the schemas, because in zod 4 a missing key fails even when its schema is `z.unknown()`.
  - Open Library's ISBN response has no description, so only Google's results carry one.
  - Errors never include the request URL, since Google's carries the API key.
  - The rate-limit bucket is a text column, not an enum, so a new bucket needs no migration. The service only accepts the names in `RATE_LIMITS`.
  - Retry-After is kept between 1 and 60 seconds, in case the app and database clocks disagree.
  - `findBookByIsbn13` doesn't exclude private books at the model level. `lookupIsbn` treats a private match as not in the catalog.
- **Moved to later sub-phases:**
  - Marking search results that are "In your library" needs the signed-in user, so it moves to 4c.
  - Calling `consumeRateLimit` belongs to the controllers in 4b and 4c, which don't exist yet.
  - Deleting `api/books/route.js` stays with 4c.
- **Found for 4c:** a search result's ISBN is the first valid one in the work's list, which can be another language's edition. For example, *Dune Messiah* came back with a Spanish ISBN. Adding the result looks that edition up, so 4c should show the edition before adding, or prefer the reader's language when a work offers several.
- **Verified:**
  - 102 new tests, using real Open Library responses and a real Google quota error as fixtures. The Google success fixtures are hand-written, because the keyless API's quota was zero.
  - The rate-limit SQL against the local database with throwaway users, since removed: counting, separate buckets and users, 20 parallel requests getting 20 distinct counts, the window resetting, and the cascade delete.
  - One run of the real service against the live APIs: an ISBN-10 found *Dune* with cover and pages, search returned 10 results, and Google's `429` was handled as a miss.
- **You need to do:**
  - Add `METADATA_USER_AGENT` and `GOOGLE_BOOKS_API_KEY` to `.env.local` and to Vercel (see "Env vars").
  - Run `npx prisma migrate deploy` against any other database (Supabase).

## 4b — Add by ISBN

1. **Service,** `addBookByIsbn(userId, { isbn, formats, status, dates })` in `library.service.ts`, in one transaction:
   - **The client sends only the ISBN and the reader's choices, never the book details.** The server looks the ISBN up again (cheap thanks to the cache), so the shared catalog only ever holds what a provider or a manual entry said, not what a request claimed.
   - It finds or creates the `Book` with `metadataSource` and `openLibraryId` or `googleBooksId` set, then calls `addBookToLibrary` with source `ISBN`.
   - **Filling a blank ISBN:** when the book was matched by `dedupeKey` and has no ISBN, the looked-up `isbn13` and `isbn10` are written to it, with `updateMany` where `isbn13` is null, so it only ever fills a blank and never overwrites. Later lookups and imports then match it by ISBN. If another book got that ISBN at the same moment (the unique key), the fill is skipped and the add still succeeds. Private books are never matched here, so they're never touched.
   - The usual rules apply: no format means Wishlist, and a book already in the library only gains formats.
2. **Controller:** server actions in `library.controller.ts`, each authenticating with `requireUser` and validating with zod:
   - `lookupIsbn(isbn)` returns the preview.
   - `addBookByIsbn(formData)` adds the book.
3. **UI** on `/books/new`, which becomes three tabs: **Search**, **ISBN** and **Manual**. On a phone, the tab bar's "Add" goes here.
   - **ISBN tab:** an ISBN field accepting hyphens and spaces, a "Look up" button, and a "Scan barcode" button (4d).
   - **Found:** a preview card with cover, title, authors, year and pages, then formats, status and read dates (the same components as the manual form), and "Add".
   - **Already in your library:** the card says which list it's on and links to it. Adding still only adds the ticked formats.
   - **Not found:** "We couldn't find this ISBN", with "Fill in by hand" opening the Manual tab with the ISBN already filled in.
   - After an add, the form clears and confirms which list the book went to, like the manual form, so you can add several in a row.
4. **Tests:** the add flow with the metadata service mocked (new book, existing book gaining a format, a book matched by title and author gaining its blank ISBN, a book that already has an ISBN left alone, a book that disappeared between lookup and add), and the controller's validation and rate limit.

### 4b outcome

- **Code:**
  - `previewIsbn` and `addBookByIsbn` in `library.service.ts`.
  - `findOrCreateMetadataBook` and `fillMissingIsbn` in `book.service.ts`, and `fillBookIsbn` in `book.model.ts`.
  - The `lookUpIsbn` and `addBookByIsbn` actions in `library.controller.ts`, validated by `library/isbn-book.schema.ts`.
  - UI in `components/pages/books/new/`: `AddBookTabs.tsx`, `IsbnLookup.tsx`, and `FormatsField.tsx` and `isbn-input.ts`, both split out of `AddBookForm.tsx` so the two tabs share them.
- **Page:** `/books/new` has two tabs, **ISBN** (the default) and **Manual**.
  - The Search tab comes with 4c and the "Scan barcode" button with 4d.
  - Both tabs stay mounted, so switching doesn't lose what's typed.
  - "Fill in by hand" on a miss opens Manual with the ISBN filled in.
- **Choices the plan left open:**
  - **The preview shows what adding would store.** A provider's book that matches a catalog book by title and author shows the catalog's details, since that book is reused unchanged. A book already in the library shows the reader's own cover, authors and pages first, per the domain rules.
  - **A book already in the library** hides the status and dates, since a re-add ignores them, and the button reads "Add formats".
  - **Both actions count toward the `ISBN_LOOKUP` limit,** because both look the ISBN up. A preview and an add cost two, so the limit allows about 30 books a minute.
  - **Filling a blank ISBN runs after the add's transaction, as a best-effort extra, rather than inside it.** A unique-key clash would abort a Postgres transaction, so `fillBookIsbn` catches that clash (`P2002`) and skips the fill. The plan had it inside the transaction.
  - **Each fact on the preview card stays on one line,** so an ISBN never breaks across lines on a phone.
- **Fixed after the outcome above, in the same commit:**
  - **`TextField` passes its props on.** It now forwards `onChange`, `id`, `ref` and `autoComplete` to its input. Before, the ISBN tab's formatting never ran once that tab used `TextField`. The ISBN tab's input has its own id, `lookup-isbn`, since both tabs stay mounted and the Manual form's ISBN field is `isbn`.
  - **Covers, in a shared `components/BookCover.tsx`,** used by the preview card and the shelf cards:
    - **Open Library and Google Books covers go through Next's image optimizer.** The app's server fetches them, so the reader's browser never does. Older Open Library covers redirect twice to the Internet Archive, which failed in the user's browser; the optimizer follows up to 3 redirects.
    - **The allowlist** is `images.remotePatterns` in `next.config.ts`: Open Library's `/b/**` with no query string, and Google's `/books/content`, whose links need one. Other hosts, query strings and paths get a `400`.
    - **Other covers stay a plain `<img>`** with no referrer. That's all of today's library: 233 Amazon covers and one from Goodreads.
    - **Missing or failed covers** show `public/assets/cover-placeholder.jpg`. A failure that happens before React is ready is caught by checking the image when it mounts.
    - Image optimization on Vercel has a monthly limit on the free plan, and only the two optimized hosts count toward it.
  - **ISBN fields accept only what an ISBN can contain:** digits, and an X only as the last character of an ISBN-10 (`formatIsbn` in `books/isbn.ts`). Before, an X typed anywhere was kept and could push a real digit off the end.
- **Not written:** the plan's test for "a book that disappeared between lookup and add". Catalog books are never deleted (deleting a book only removes the `UserBook`), so it can't happen.
- **Verified:**
  - 33 new tests.
  - The service against the local database and the live APIs, with a throwaway user, since removed:
    1. An ISBN-10 preview found *Dune* on Open Library.
    2. Adding it with no format put it on the Wishlist, with source `ISBN`, a new catalog book with its Open Library id, and 896 pages.
    3. Previewing again came from the catalog and showed it in the library.
    4. Re-adding with Physical and Finished moved it to TBR, ignored the status, and added no read.
    5. Google Books answered a lookup Open Library missed, so the API key works.
  - The tabs, preview cards and ISBN formatting in the browser through a temporary render, since removed, on desktop and at phone width.
- **Not verified:** a signed-in click-through of `/books/new`. Auto mode refused a temporary auth bypass for the browser test, so the actions were exercised through the service and unit tests only. Try it once while signed in.

## 4c — Search by title or author ✅ done (checked by the user)

1. **Endpoint:** `GET /api/books/search?q=…`, a route handler using `getRequestUser`, so the extension could use it later. A `GET` can be cached and cancelled, which suits search-as-you-type better than a server action. It replaces the empty `api/books/route.js`.
2. **Search tab:**
   - One input, debounced (400 ms), searching from 3 characters, and cancelling the previous request when a new one starts.
   - Results show cover, title, authors and year, with "In your library" where it applies.
   - Choosing a result opens the same preview, formats and add step as the ISBN tab.
   - Loading, empty ("No books found. Try the author's surname, or add it by hand") and error states.
3. **Adding a result:**
   - **With an ISBN:** it goes through `addBookByIsbn`, with source `SEARCH` instead of `ISBN`.
   - **Without an ISBN,** which is common for old books: a sibling, `addBookFromProvider(userId, { source, sourceId, … })`, looks the provider record up again by its id and dedupes by `dedupeKey`.
4. **Tests:** the route's auth, validation and rate limit (no token is 401, short or long query is 400, past the limit is 429), and the service's no-ISBN path.

### 4c outcome (2026-11-15)

- **Endpoint:** `app/api/books/search/route.ts`. It checks, in order:
  1. `getRequestUser` → 401;
  2. `parseQuery` → 400 (empty, under 3 or over 200 characters);
  3. `consumeRateLimit(BOOK_SEARCH)` → 429 with `Retry-After`;
  4. `searchForLibrary` → `{ results }`.

  The empty `api/books/route.js` is removed.
- **Looking a result up again by id:** `MetadataProvider` gains `lookupId(sourceId)`.
  - Open Library (`OL…W` or `OL…M` only) asks its search API for `key:/works/…` or `edition_key:…`, parsed like a search result. Both queries were checked against the live API.
  - Google Books fetches `/volumes/{id}`, with the id checked by `cleanSourceId`.
  - `metadata.service.lookupById(source, sourceId)` asks the result's own provider, then fills cover and page gaps from the other.
- **Service (`library.service.ts`):**
  - `searchForLibrary` marks results already in the reader's library by ISBN or dedupe key, in one query (`library.model.findUserBooksMatching`).
  - `previewSearchResult` previews by ISBN when the result has one, and otherwise by the provider record. It also uses the record when no provider knows the ISBN, and then sets `preview.ref`.
  - `addBookFromProvider` looks the record up again, dedupes it through `findOrCreateMetadataBook`, and adds it with source `SEARCH`.
  - `previewIsbn` now shares `previewLookup` with search. `IsbnPreview.isbn13` is optional, and it gains `ref`.
- **Controller:**
  - `previewSearchResult` and `addSearchBook` count as ISBN lookups for the rate limit.
  - `addSearchBook` adds by ISBN when the preview had one (with source `SEARCH`), and otherwise by `source` and `sourceId`.
  - Validation is in `isbn-book.schema.ts` (`searchResultSchema`, `parseSearchBook`). The reader's choices are now shared through `choiceFields` and `toChoices`.
- **UI:**
  - `/books/new` gets a **Search** tab, first and selected by default.
  - `SearchLookup.tsx` debounces for 400 ms, searches from 3 characters, and aborts the previous request.
  - Results show cover, title, authors, year, and "In your library · <list>".
  - There are loading, error and empty states. The empty state has a "Fill in by hand" button.
  - Choosing a result shows the same preview and add form as the ISBN tab, now shared in `BookPreview.tsx`, with "Back to results". After an add, the search runs again so the result shows as in the library.
- **Tests:**
  - `books-search.route.test.ts`: 401, 400 for each bad query, 429, success, and errors.
  - Providers' `lookupId`, including refused ids that never reach the network.
  - `lookupById`.
  - The service's search marking, preview paths and no-ISBN add.
  - The controller's preview and add, by ISBN and by record, with their validation.
- **Deviation:** the plan didn't say which tab opens first. Search does, ahead of ISBN and Manual.
- **Not checked yet:** the tab in the browser, signed in. The running server answers 401 to an unauthenticated search.
- **Fix (2026-11-15), found by the user:** adding a result that had an ISBN failed with "Choose a search result.". Its preview came from the ISBN lookup and dropped the result's `ref`, so the form sent no `source` or `sourceId`, which the search form requires. `previewSearchResult` now always keeps the `ref`, and adding still uses the ISBN when there is one. The test that had asserted the missing `ref` now expects it. New `parseSearchBook` tests check what the form sends for each kind of preview.
- **Fix (2026-11-15), found by the user:** choosing *The Midnight Library*, found in English, opened another language's edition with another cover.
  - **Cause:** Open Library's search returns works. The result took the first ISBN in the work's list, which mixes every edition (here a Turkish one, 978605…), and the preview looked that ISBN up.
  - **Fix:** the search now asks for `editions`, the edition of each work that best matches the query. A result uses that edition's key, title, ISBN and cover, so it's the English edition (9781101949443, cover 15164860), and the preview's ISBN lookup returns it too. This was checked against the live API.
  - **When the matched edition has no ISBN:** the result has none, rather than borrowing another edition's, and it's added by its record.
  - **Only a work with no matched edition** falls back to the work's own fields, as before.
  - **Tests:** a mixed-language work, ISBN-10 conversion, no ISBN, a missing cover, and the fallbacks.

### 4c follow-up: save the synopsis when adding by search or ISBN ✅ built (2026-11-15)

Asked by the user on 2026-11-15. The reader has just picked an exact provider record, so this is the most reliable moment to get its synopsis. Saving it now means Phase 5's enrichment and a future book details page find it in the database.

1. **Google Books:** already done. Its records carry `description`, which `findOrCreateMetadataBook` stores in `Book.description`.
2. **Open Library:**
   - **Fetch:** neither its search nor its ISBN response has a description, but the work record (`/works/{OL…W}.json`) often does, as a string or as `{ type, value }`. For an edition (`OL…M`, or the edition the ISBN lookup returns), read the edition's `works[0].key` first, which is one more request.
   - **Provider:** add a provider method such as `fetchDescription(sourceId)`, cleaned with `cleanDescription` and checked with `cleanSourceId` and the `OL…W`/`OL…M` pattern before any request. It goes through `fetchProviderJson`, so it gets the timeout, size cap and day-long cache.
3. **When:** after the add's transaction, as best-effort, like `fillMissingIsbn`. It fills `Book.description` only when it's empty and the book is shared (`ownerId: null`), and never overwrites. A failed fetch never fails the add.
4. **Which adds:** `addBookFromProvider` and `addBookByIsbn` (source `SEARCH` or `ISBN`), including an add that reuses an existing catalog book with no description. Amazon imports and manual adds have no provider record, so they're covered by the later fill (Phase 5, "Synopsis for books added without a lookup").
5. **Tests:**
   - The provider: a string, an object and a missing description; an edition leading to its work; ids refused before the network.
   - The service: an empty description gets filled; an existing one is never overwritten; a private book is skipped; a provider failure leaves the add in place.

**Done when:** a book added by search or ISBN from Open Library or Google Books has its synopsis in `Book.description` when the provider has one, without slowing or failing the add.

**Outcome (2026-11-15):**
- **Provider:** `openLibrary.fetchDescription(sourceId)`, an optional method on `MetadataProvider`.
  - It refuses anything but `OL…W` or `OL…M` before a request.
  - For an edition, it reads `works[0].key` from `/books/{M}.json`, accepting only a work key.
  - It then reads `/works/{W}.json`, with the description as a string or `{ value }`, cleaned by `cleanDescription`.
  - It goes through `fetchProviderJson`. Checked live: *The Midnight Library*'s English edition leads to its work's synopsis.
- **Metadata service:**
  - `findDescription(metadata)` uses the record's own description (Google), or else asks the provider (Open Library). A provider error counts as none.
  - `findDescriptionByIsbn(isbn13)` is for a catalog book reused by its ISBN: the first provider that knows the ISBN and has a synopsis.
- **Book service:** `fillMissingDescription(book, metadata?)` skips private books and books that already have a synopsis. It fills through `book.model.fillBookDescription`, which only updates a shared book whose description is null or empty, so it never overwrites. It logs rather than throws.
- **When:** `addBookByIsbn` and `addBookFromProvider` now also return the provider record they used (`metadata`, undefined for a reused catalog book). The `addBookByIsbn` and `addSearchBook` controllers schedule `libraryService.saveSynopsis(added)` with Next's `after()`, so it runs once the response is sent and can't slow or fail the add.
- **Tests:**
  - The provider: string, object, missing, HTML and edition-to-work descriptions, and refused ids.
  - `findDescription` and `findDescriptionByIsbn`.
  - `fillMissingDescription`: fills, never overwrites, skips private books, logs failures.
  - The model's update filter.
  - That the controllers schedule the fill rather than run it inline.
- **Deviation:** the plan said "after the add's transaction". It runs after the response instead (`after()`), which also keeps the extra Open Library requests off the add's wait.
- **Fix (2026-11-15), found by the user:** *Alchemised*, added by search, got no synopsis.
  - **Cause:** Open Library has it on the edition (OL62430938M), and its work (OL45882131W) has none. `fetchDescription` only read the work's.
  - **Fix:** it now reads the edition's own synopsis first, and asks the work only when the edition has none.
  - **Tests:** the edition's own synopsis, with no work request, and neither having one.
  - **To fill that book:** add it again by ISBN or search. That only adds formats, and the fill runs again.
- **Fix (2026-11-15), found by the user:** a picked search result was replaced by another record with the same ISBN.
  - **What happened:** the user picked *Alchemised* by SenLinYu (Open Library edition OL60695609M). It was added from OL62430938M ("ALCHEMISED", no authors), which shares ISBN 9780593972717.
  - **Cause:** a result with an ISBN was previewed and added by that ISBN, and Open Library's ISBN lookup answers with whichever record it picks.
  - **Fix:** a search result is now always previewed and added from the exact record picked (`lookupById`, then `addBookFromProvider`). That record's ISBN is still shown, and still matches a book already in the catalog. `searchResultSchema` and `parseSearchBook` no longer take an ISBN. The add form sends an ISBN only from the ISBN tab, and `addSearchBook` never calls `addBookByIsbn`.
  - **Tests:** updated for the picked record winning, and an ISBN sent with a search add being ignored.
- **Still wrong in the user's library:** the *Alchemised* catalog book added before this fix kept "ALCHEMISED" and no authors. A re-add by search, with the right record, matched that book by ISBN and reused it unchanged.
- **Change (2026-11-15), decided by the user: provider records fill a matched catalog book's blanks.**
  - **Rule (`books/catalog-blanks.rules.ts`, `catalogBlanksFrom`):** a search or ISBN add whose provider record matches a catalog book fills that book's blank subtitle, authors, cover, page count, year, and the provider's own id. Filling the authors also rebuilds the dedupe key and author search from them.
  - **Never overwrites:** a detail that's there stays, and the title is never a blank, so "ALCHEMISED" stays in capitals. Private books are never touched.
  - **Only provider records:** manual adds and Amazon imports never fill the shared catalog.
  - **Where:** `book.service.fillMissingDetails`, after `fillMissingIsbn`, in `addBookByIsbn` (provider path) and `addBookFromProvider`. It's best effort and logs failures.
  - **Model:** `book.model.fillBookBlanks` re-checks every field it fills is still blank in the same update, so a race can't overwrite.
  - **Preview:** a matched catalog book's blanks show the record's values, as the add will save them.
  - **Tests:**
    - The rule: the *Alchemised* case, nothing overwritten, private books, ids by source.
    - The model's update filter, `fillMissingDetails`, the two adds calling it, and the preview.
  - **For the user's book:** adding *Alchemised* again by search fills in SenLinYu and the page count and year, and keeps everything else. **✅ Checked by the user on 2026-11-15.**

### Change: one book form for adding and editing ✅ built (2026-11-15, not yet checked signed in)

Asked by the user, who added `book` and `canEdit` props to `AddBookForm`. The same form now serves the Manual, ISBN and Search tabs and the shelf's edit dialog.

- **`AddBookForm`:**
  - `book` fills every field (`bookFormValues`: title, subtitle, authors, ISBN, pages, cover, formats, status, read dates, audiobook length, acquired date).
  - `canEdit` false locks the catalog's title, subtitle and ISBN, and drops the required-field check. Authors, pages and cover stay editable as the reader's own.
  - `submit` saves it from the submit handler, not as a form action, so a rejected save keeps what was typed and a successful add remounts it empty.
  - `hidden` adds the ISBN or the search record.
  - `editing` passes the book to `StatusField` for its reads.
  - `formId` lets a dialog's own button submit.
  - `addFormatsOnly` is the "already in your library" mode.
  - `onDone` and `onPendingChange` report back.
- **ISBN and Search tabs:** `AddPreviewedBook` (`BookPreview.tsx`) now renders `AddBookForm` from the preview, with `canEdit={false}`. The preview card above it is unchanged.
- **Edit dialog:** `EditBookDialog` renders `AddBookForm` with the shelf book, `canEdit={false}` and `editing`, mounted only while open. `ShelfBook` gains the catalog's `subtitle` and `isbn13`, shown locked.
- **Server:** `parseIsbnBook` and `parseSearchBook` accept `authors`, `pageCount` and `coverUrl`.
  - `addBookByIsbn` and `addBookFromProvider` store them as the reader's own only where they differ from what the preview showed: the catalog's details, with blanks filled from the record.
  - `readerDetails` is shared with `editUserBook`, which already kept only differences.
  - `createUserBook` takes these details.
- **Ids:** `FormatsField`, `StatusField`, `AudioLengthField`, `PartialDateField` and the form's text fields now use `useId`. The add page keeps three forms mounted, which had duplicate ids, so a label could tick another tab's checkbox.
- **Tests:** the reader's details on an add (kept only when changed), and the ISBN and Search schemas reading them.
- **Then (2026-11-15), asked by the user: the preview card is gone.**
  - The user saw the ISBN tab looking as before after a lookup: probably a book already in their library, whose form showed only the format checkboxes and the acquired date.
  - The form now always shows every field. For a book already in the library (`addFormatsOnly`), all details are locked, the status is hidden, and only formats and the acquired date can be added.
  - The card's cover, year, source and "Already in your library · View the shelf" moved into the form's new `header` slot (`PreviewHeader` in `BookPreview.tsx`). The ISBN and Search tabs no longer render the card. The user had already removed it from Search.
- **Not checked yet:** the forms in the browser, signed in.

## 4d — Scan the barcode

A book's barcode is an EAN-13 starting with 978 or 979, which is its ISBN-13. Scanning only produces an ISBN and hands it to the ISBN tab (4b).

1. **Photo first:** a "Scan barcode" button opens the rear camera through `<input type="file" accept="image/*" capture="environment">`.
   - This works on iPhone and Android without a camera permission prompt or a live video stream.
   - **The photo is decoded in the browser and never uploaded.**
   - Large phone photos are scaled down to about 1,600 px on the long side on a canvas before decoding, which is faster and often more reliable.
2. **Decoder:** the standard `BarcodeDetector` API (format `ean_13`), everywhere.
   - Chrome on Android has it built in. **Safari on iPhone and Firefox don't,** so the **`barcode-detector` package** fills it in. It implements the same API on top of `zxing-wasm` (the C++ ZXing compiled to WebAssembly), so there's one code path for every browser.
   - Approved by the user on 2026-11-08 instead of the original `@zxing/browser`. Before adding it, check its current version (at least two weeks old), its license and the WASM file's size, and run `npm audit`.
   - Use the built-in API when it exists and load the package with a dynamic `import()` only when it doesn't, at the moment scanning starts, so it never weighs on other pages.
   - The WASM file is fetched from a CDN by default. Serve it from the app instead (it can be pointed at a local copy), so scanning doesn't depend on a third party.
3. **Reading the result,** a pure helper with unit tests:
   - Accept only 13 digits starting 978 or 979 with a valid check digit (`isValidIsbn13`).
   - Ignore the small 5-digit add-on (the price code) printed beside some barcodes.
   - A valid EAN-13 that isn't a book (a magazine or a product) shows "That isn't a book barcode."
   - No barcode found shows "Couldn't read a barcode. Try again closer, in good light, or type the ISBN."
4. **Then:** the ISBN fills the ISBN tab's field and the lookup runs straight away. "Scan another" is offered after an add.
5. **Verify** on a real iPhone and a real Android phone, with a clean barcode, a curved spine-side barcode, a worn one, and a book with the price add-on.

## Env vars

Both are server-only and go in `.env.example` with placeholders:

| Variable | Needed | What for |
|---|---|---|
| `METADATA_USER_AGENT` | Yes | Identifies the app to Open Library, for example `Inkwell/1.0 (contact URL or address)` |
| `GOOGLE_BOOKS_API_KEY` | Yes | Per-project Google Books quota instead of the shared keyless one |

**You need to do:** in the Google Cloud console, create a project (or reuse the Firebase one), enable the **Books API**, create an API key and restrict it to the Books API. It's only used from the server, so it needs no website restriction. Add it to `.env.local` and to Vercel. The code still works without it, on the shared quota, so a missing key isn't fatal in development.

## Decisions

Made with the user on 2026-11-08:

| Question | Decision |
|---|---|
| Google Books key | Get one now (`GOOGLE_BOOKS_API_KEY`; see "Env vars") |
| Gaps between providers | Google Books fills a missing cover or page count when Open Library finds the book (4a, step 5) |
| Search language | All languages, no filter |
| Matching by title and author | Fill the blank ISBN on the matched catalog book, never overwrite (4b) |
| Barcode library | `barcode-detector` (on `zxing-wasm`), not `@zxing/browser` (4d) |
| Live scanning | Photo only for now; live scanning moves to "Later" |
| Rate limiting | Per user, now, counted in Postgres (4a, step 7) |

## Done when

- Typing an ISBN-10 or ISBN-13, with or without hyphens, shows the right book. Adding it with no format puts it on the Wishlist, and with a format on TBR.
- Looking up an ISBN already in the catalog makes no request to Open Library or Google Books.
- When Open Library doesn't have a book, Google Books is tried, and when neither does, the manual form opens with the ISBN filled in.
- Searching "dune herbert" lists the book, and adding a result works with and without an ISBN.
- Adding a book already in your library only adds formats and says which list it's on.
- Photographing a book's barcode on an iPhone and on an Android phone fills in the ISBN and finds the book, and the photo is never uploaded.
- A book Open Library knows without a cover gets its cover from Google Books.
- A 61st lookup within a minute is refused with a clear message, and works again a minute later.
- A malformed or oversized provider response, a timeout, and an invalid ISBN all end in a clear message, never a crash.
- Type check, lint, tests and build pass, and one user can't see another's private books through lookup or search.

## Later

- Live scanning: a camera viewfinder (`getUserMedia`) that reads barcodes continuously, quicker for several books. Needs a camera permission and HTTPS.
- Scan several books in a row into a queue, then set formats for all of them at once.
- Choose a specific edition (cover, language, page count) of a work.
- Let the extension use `/api/books/search` to fill in ISBNs for imported ebooks.
