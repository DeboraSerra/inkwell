# Phase 5.6 — Dashboard

[← Plan overview](README.md)

⏳ Planned. Asked by the user on 2026-11-21, to come before Phase 6. It replaces the "Welcome" placeholder at `/` (`src/app/(app)/page.tsx`). Phase 6's journal UI later adds the quick "log progress" and goal progress to this page rather than building a second dashboard.

**Applies to every step**

- **A new `stats` module** in `src/server/stats/`: `stats.model.ts` (grouped Prisma queries, every one filtered by `userId`), `stats.rules.ts` (pure bucketing: years, genres, formats), `stats.service.ts`. No mutations, so no controller. The page calls the service; types go in `src/types/stats.type.ts`.
- **Counts are computed on each request, never stored,** like goal progress.
- **Dates are UTC calendar dates.** "This year" is the UTC year.
- **Each section is its own Server Component** under `components/pages/dashboard/`, so a slow query doesn't hold up the rest (wrapped in `<Suspense>`), and each has an empty state for a new reader.
- **Mobile-first:** one column on phones, a two-column grid from `md`.
- Tests in `src/server/tests/stats/`: rules directly, the service with the model mocked, the model with the recording fake asserting `userId` scoping.

## 5.6a — Currently reading

1. Books with status `READING`, newest started read first (the latest `ReadThrough.startedAt`, then `addedAt`).
2. Cover, title, authors, formats, and the start date when there is one; each links to the book on its shelf.
3. Show up to 6, with "See all" linking to `/books/shelves?shelf=reading`.
4. Empty state: a link to the TBR shelf.

## 5.6b — Books read by year (chart)

1. One bar per year: the number of `ReadThrough` rows with `outcome = FINISHED` and an `endedAt` in that year, so a reread counts again (as the `BOOKS` goal will).
2. A year-only or month-only `endedAt` still counts in its year.
3. Finished reads with no date (bulk moves) are left out of the bars and shown as one line under the chart: "N finished books have no date".
4. Years with no reads between the first and the last show as zero, so gaps are visible.

## 5.6c — Books read by genre this year (chart)

1. The reads counted in 5.6b for the current year, grouped by the book's genre: the reader's own when `genreEdited` is set, otherwise the catalog's (`library/book-topics.rules.ts`), shared in a rule rather than repeated.
2. Books with no genre go into "No genre".
3. A horizontal bar chart, sorted by count; genres past the top 8 fold into "Other".
4. Empty state when nothing has been finished this year yet.

## 5.6d — Using the extension

1. A short card: what the extension does (imports the Kindle library into the ebook TBR), then three steps: install it, create a token, open Amazon's "Manage Your Content and Devices" page and click the extension.
2. **Install link:** the Chrome Web Store address, from a new `NEXT_PUBLIC_EXTENSION_URL` variable (documented in `.env.example`). Until the extension is published (Phase 7) the link is hidden and the card says to load it unpacked.
3. **Token link:** `/settings?tab=tokens`. The settings tabs don't read the URL yet, so `components/pages/settings/index.tsx` gets a `defaultValue` from `searchParams.tab` (`profile` or `tokens`, anything else falls back to `profile`).
4. The card can be dismissed, and comes back from a link in settings (see open question 5).

## 5.6e — Books added per year, by type (chart)

1. A stacked bar per year, one segment per format (ebook, physical, audiobook, and "not owned" for the wishlist). A book owned in two formats counts once in each (see open question 3).
2. The year comes from `acquiredAt`, falling back to `addedAt` when it's unknown (see open question 2). The two dates stay separate in the data; this is only how the chart picks one.
3. A total per year above each bar.

## 5.6f — Closing

1. `/privacy` doesn't change (nothing new is collected or sent).
2. Check every section signed in, on a phone width and a desktop width, with an empty account and with the real library.
3. Mark the phase done here and in `README.md`, with an "Outcome" section.

**Done when**

- `/` shows the five sections with real data and sensible empty states.
- The stats tests pass, including rereads, undated reads, year-only dates, reader-edited genres and multi-format books.
- `npx tsc --noEmit`, `npm run lint`, `npm test` and `npm run build` pass.

## Open questions

1. **Chart library.** None is installed. Recommended: shadcn's `chart` component (`npx shadcn add chart`), which brings `recharts` as a dependency and uses the theme tokens. The alternative is hand-written SVG bars with no new dependency. Which one?
2. **"Added per year": which date?** `acquiredAt` (when you got the book, Amazon's purchase date) with `addedAt` as fallback, or `addedAt` alone (when it entered Inkwell, which puts the whole Kindle import in one year)? Recommended: `acquiredAt`, falling back to `addedAt`.
3. **"Per type": format or source?** Format (ebook / physical / audiobook / not owned) or how it was added (Amazon import, search, ISBN, manual)? And should a book in two formats count in both? Recommended: format, counting in each.
4. **Which shelves count in "added"?** Every book, or only owned ones (leaving the wishlist out)?
5. **Extension card:** always shown, dismissible (remembered in a cookie), or shown only until the first import?
6. **Chart ranges:** every year since the first read, or the last N years (and how many)?
