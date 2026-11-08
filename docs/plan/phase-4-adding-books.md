# Phase 4 — Search and ISBN

[← Plan overview](README.md)

**Status: in progress.** 4a is implemented on `dev`, not committed. It was started at the user's request before Phase 3's "Done when" list ([phase-3-mvp.md](phase-3-mvp.md#done-when)) was checked.

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
  - Run `npx prisma migrate deploy` against any other database (Neon).

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

## 4c — Search by title or author

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
