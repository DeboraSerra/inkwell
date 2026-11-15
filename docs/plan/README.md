# Inkwell — Online Reading Journal: Plan

## Decisions

| Topic | Decision |
|---|---|
| Users | Built for you alone, but every piece of data belongs to a user, so more people can sign up later. No social features. Login with Firebase Auth. |
| Hosting | Vercel (Next.js) and Supabase Postgres, using Prisma |
| Extension import | The extension POSTs the scraped list directly to an authenticated API endpoint |
| Extension releases | One store release per batch of extension changes: a release step goes last, after every extension change the plan includes, since each submission waits for the store's review |
| Re-import | Sync: add new books, match existing ones (ASIN, then ISBN, then normalized title + author), and only ever add a format. Never overwrite your status, dates or list order |
| Lists | Five: **Wishlist, TBR, Reading, Finished, DNF**. The list is `UserBook.status`; lists are only views in the UI. A wishlist book moves to TBR as soon as it has a format |
| Formats | A multi-value detail of the book, not a list: ebook, physical and/or audiobook. Filterable on every list |
| Priority | **MVP first:** add books manually or by extension, move them between lists, and browse them with filters. Everything else follows |
| Adding books | MVP: manual form and the extension. Then: search Open Library / Google Books, and add by ISBN (typed, or scanned with the camera later) |
| Read history | A book can be read several times. Earlier reads are never erased. Bulk moves record no invented dates |
| Journal | After the MVP: reading log, book reviews, reading goals |
| Goals | Flexible (any time period, any metric). Default: books per year |
| AI | Claude API fills in genre, tropes, tags and length, choosing only from the curated genre and trope lists |

## Phases

0. [Phase 0 — Fix the security issues](phase-0-security.md) ✅ done
1. [Phase 1 — Foundation and auth](phase-1-foundation-auth.md) ✅ implemented (plus email and password sign-in)
2. [Phase 2 — Data model](phase-2-data-model.md) ✅ implemented (2c's shelves are removed by 3a)
   - [2a — Catalog](phase-2-data-model.md#phase-2a--catalog)
   - [2b — Library](phase-2-data-model.md#phase-2b--library)
   - [2c — Shelves](phase-2-data-model.md#phase-2c--shelves)
3. **[Phase 3 — MVP: add books and browse them](phase-3-mvp.md) ✅ 3a–3d done; ✅ three fixes built (DNF, `&amp;`, shelf search); ⏭️ next: 3e, 3f** (Docs-tab fix not yet run on the real page)
   - 3a — Rework the model (formats, status as the list, read history) ✅ implemented
   - 3b — Add books manually ✅ implemented
   - 3c — Add books through the extension ✅ done, run on Amazon
   - 3d — Browse, filter and move books ✅ done, at `/books/shelves`
   - **Fix: moving to DNF ✅ built:** Wishlist, TBR and Finished books can now move to DNF; not yet clicked through signed in
   - **Fix: searching a shelf jumps back to TBR ✅ built:** search keeps the shelf and filters, and clearing the box removes `?q=`; browser check still to do signed in
   - **Fix: `&amp;` in imported titles ✅ built:** imports decode entities; the backfill fixed 5 titles locally and 41 on Supabase
   - **3e — Polish, before 4c:** ✅ show the account an import goes to (item 1); ✅ give the options page a favicon (item 2); ✅ redesign the options page (item 3); ✅ add a copy button for new API tokens (item 4, not yet clicked signed in); ✅ add a books-per-page select (5, 10, 20, 30, 50), default 10 on phones and 30 on desktop (item 5, not yet checked signed in); ✅ show the full title on hover (item 6); ✅ move to the next date part automatically (item 7); ✅ show read dates on shelf cards, with "+N" for earlier reads (item 8); ✅ add an audiobook length (item 9); ✅ add past reads from the dates area, with "latest" now by date (item 10); ✅ extension 2.2.0 built (item 11; screenshot retake and upload are the user's)
   - **3f — Purchase dates, in progress:** app side built (column, parser, import, form field, and sorting by date added, purchase date, title, or last finished on Finished); the extension sends the date and 2.3.0 is built; deploying, the Chrome check, upload and re-import are the user's
   - **Fix: re-importing Docs duplicates documents ✅ built:** the Docs import now matches the reader's own library first; `prisma/merge-duplicate-docs.ts` merges such pairs into the original entries, moved to the private book. The 88 on Supabase were merged by hand on 2026-11-15
   - **Change: a year alone shows in full ✅ (2026-11-15):** on shelf cards, a year-only date shows "2024", not "24"; dates with a month or day keep the two-digit year
   - **3g — An "Owned" shelf ✅ built (not yet checked signed in):** a tab with every book owned in any format, across TBR, Reading, Finished and DNF; a view of status and formats, not a sixth list
4. [Phase 4 — Search and ISBN](phase-4-adding-books.md) in progress; 4c follows 3e and 3f
   - 4a — Metadata providers (Open Library, Google Books) ✅ done, plus the per-user rate limit
   - 4b — Add by ISBN ✅ done, at `/books/new`
   - 4c — Search by title or author
   - 4d — Scan the barcode
5. [Phase 5 — AI enrichment (Claude API)](phase-5-ai-enrichment.md)
6. [Phase 6 — Journal](phase-6-journal.md): reading log, reviews, goals, and progress by format (page, percentage, audiobook time remaining)
7. [Phase 7 — Quality and deploy](phase-7-quality-deploy.md)
8. [Later / nice to have](later.md)

## Architecture

The backend follows a model / service / controller layering under `inkwell/src/server/<module>/`. Biome enforces the boundaries. Every new phase builds its feature as a module in that structure. The rules are in [AGENTS.md](../../AGENTS.md#backend-architecture-model--service--controller).
