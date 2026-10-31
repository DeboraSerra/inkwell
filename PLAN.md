# Inkwell — Online Reading Journal: Plan

## Decisions so far

| Topic | Decision |
|---|---|
| Users | Built for you alone, but every piece of data belongs to a user, so more people can sign up later. No social features. Login with Firebase Auth. |
| Hosting | Vercel (Next.js) and Neon Postgres (Supabase also works), using Prisma |
| Extension import | The extension POSTs the scraped list directly to an authenticated API endpoint |
| Re-import | Sync: add new books, skip ones already there (match on ASIN, then on normalized title + author), and never overwrite your data |
| Lists | **Ebook TBR** (from the extension), **Physical TBR** (added manually), **Wishlist** (added by ISBN or search) |
| Adding books | Search Open Library / Google Books, add by ISBN (typed, or scanned with the camera later), or type it in manually |
| Journal v1 | Reading goals, reading log, book reviews |
| Goals | Flexible (any time period, any metric). Default: books per year |
| AI | Claude API fills in genre, tropes, tags and length, choosing only from the curated genre and trope lists |

---

## Phase 0 — Fix the security issues (do this first)

`npm audit` in `inkwell/` reports:

- **next 16.2.6 — critical.** Includes middleware/proxy bypass, RCE in image optimization and `next/og`, SSRF in Server Actions and rewrites, and cache poisoning. Fixed in **≥ 16.3.8**; 16.4.0 is the latest.
- postcss ≤ 8.5.22 (high). It comes in through `next` and `@tailwindcss/postcss`.
- firebase → `@firebase/firestore` → `@grpc/grpc-js` (high), plus protobufjs (moderate).
- prisma → `@prisma/config` → `deepmerge-ts` (high). This only affects development tooling.
- baseline-browser-mapping, nanoid (moderate). Transitive dependencies.

Steps:
1. Bump `next` and `eslint-config-next` to `16.4.0` (they are pinned exactly today, so `npm audit fix` won't touch them).
2. Read `node_modules/next/dist/docs` for the 16.2 → 16.4 changes (as `inkwell/AGENTS.md` asks) and apply any breaking changes.
3. `npm audit fix` (non-forced) for transitive fixes. If postcss is still vulnerable, add an `overrides` entry for it.
4. Update `firebase` to the latest 12.x. If grpc-js is still flagged, add an `overrides` entry for `@grpc/grpc-js`. Note: the web app only needs `firebase/auth`, and grpc is only used by Firestore on Node.
5. Align Prisma: right now it's `@prisma/adapter-pg@7` with `prisma`/`@prisma/client@6`. Move all three to 7.x (this also fixes deepmerge-ts), and update `prisma.config.ts` and the generator config.
6. Check that `npm run build`, `npm run lint` and `npm audit` all pass. Do the same audit for `extention/firebase-project`.
7. Commit on its own branch/PR: `fix: upgrade next to 16.4 and patch vulnerable deps`.

## Phase 1 — Foundation and auth

- Clean up the repo: delete the tracked `.DS_Store` and add it to `.gitignore`. Decide whether the vendored `.agents/.claude/.kiro` skill folders inside `extention/firebase-project` should stay.
- Firebase Auth on the client (Google sign-in). On the server, `firebase-admin` verifies the ID token and sets an httpOnly session cookie. Next.js `proxy`/middleware protects the app routes.
- `getCurrentUser()` helper. The `User` row is created on first login, using the Firebase UID as its id.
- Extension auth: a **personal API token** that you generate in Settings. Only a hash is stored in the DB. The extension sends it as `Authorization: Bearer`. This avoids running Firebase login inside the extension.
- Env/config for Vercel and Neon, with a pooled connection string for runtime and a direct one for migrations.

## Phase 2 — Data model redesign (built to scale)

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
ApiToken        userId, hashedToken, name, lastUsedAt
```

Why it's shaped this way:
- The three lists are system `Shelf` rows instead of hard-coded enums, so custom shelves ("Summer reads") cost nothing to add later.
- The status and ownership enums are what the lists filter on. A wishlist book you buy simply changes ownership and moves to a TBR shelf.
- The catalog fills in each book (metadata and AI) **once**, and every user reuses it.
- Goal progress is computed from `UserBook.finishedAt` and `ReadingSession`. It isn't stored, so it can't drift.

Replace the current migrations with a fresh `init`, since there's no production data yet. Seed genres, tropes and the system-shelf templates.

## Phase 3 — Extension → app import

- Update the extension: keep the scraper and also capture the **ASIN** (from the row's id or link), which gives reliable deduplication. Replace the clipboard copy with `POST {APP_URL}/api/imports/amazon`. Add an options page where you paste the app URL and your API token, plus feedback on progress and the result ("42 new, 310 already in library").
- Tighten `manifest.json`: content script only on `https://www.amazon.*/hz/mycd/*`, and `host_permissions` for the app URL.
- Endpoint: validate the payload with zod and upsert `Book` rows (match on ASIN → ISBN → normalized title+author). Create `UserBook` rows (ownership EBOOK, status TO_READ, source AMAZON_IMPORT) on the Ebook TBR shelf, and skip existing ones. Record an `ImportJob` and queue new books for enrichment.

## Phase 4 — Adding books by search, ISBN and manual entry

- A server-side `BookMetadataProvider` interface with Open Library first and Google Books as fallback. Results are cached in the `Book` table.
- "Add book" dialog: search by title/author, or enter an ISBN. Pick the target: Physical TBR, Wishlist or Ebook TBR.
- Manual form as the last resort.
- Later: scan ISBN barcodes with the phone camera (`BarcodeDetector`, with a `@zxing/browser` fallback).

## Phase 5 — AI enrichment (Claude API)

- A server-only module that uses the Anthropic SDK with structured output (tool use / JSON schema). The model may pick only from the genre and trope names in the DB. It returns `genres[]`, `tropes[]`, `tags[]` (free-form, capped), `lengthCategory` (short/medium/long, based on page count when known) and a confidence score.
- Run it once per catalog `Book`, never per user. Large Amazon imports use the **Message Batches API** (50% cheaper); single adds run inline. Default model: `claude-haiku-5-5`, with `claude-sonnet-5-5` as an option for books where Haiku returns low confidence.
- Run it in the background so imports return immediately: a Vercel Cron route processes `aiEnrichedAt IS NULL` books in batches. Add a queue service (Inngest / QStash) later if needed.
- You can always edit or override the AI's tags per book.

## Phase 6 — Journal UI

- **Dashboard**: currently reading (with quick "log progress"), progress on the active goal, and recent log entries.
- **Lists**: Ebook TBR / Physical TBR / Wishlist, with filters (genre, trope, length, tag), sorting, drag-to-reorder priority, and a "Pick my next read" random suggestion.
- **Book page**: metadata, AI tags, status changes (start, finish, DNF), reading log timeline, review.
- **Reading log**: quick entry (page/percent, minutes, note, mood).
- **Review**: shown when you finish a book. Rating, text and favorite quote.
- **Goals**: create or edit goals; the default yearly books goal is suggested on first login.
- Server Components plus Server Actions for mutations, Tailwind 4, mobile-first (you'll log reading from your phone).

## Phase 7 — Quality and deploy

- zod validation on every input. Every query is scoped by `userId` (write a test for this). Rate-limit the import and AI endpoints.
- Vitest for domain logic (dedupe, goal progress) and Playwright for one happy path.
- GitHub Actions: lint, typecheck, test, `npm audit --audit-level=high`. Dependabot for npm.
- Vercel deploy with a Neon branch per preview deployment.

## Later / nice to have
Custom shelves UI, stats page (pages per month, genres breakdown), Goodreads CSV import, quotes and highlights, reread tracking, export your data, social features.
