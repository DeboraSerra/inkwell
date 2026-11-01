# Inkwell — Online Reading Journal: Plan

## Decisions

| Topic | Decision |
|---|---|
| Users | Built for you alone, but every piece of data belongs to a user, so more people can sign up later. No social features. Login with Firebase Auth. |
| Hosting | Vercel (Next.js) and Neon Postgres (Supabase also works), using Prisma |
| Extension import | The extension POSTs the scraped list directly to an authenticated API endpoint |
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
1. [Phase 1 — Foundation and auth](phase-1-foundation-auth.md) ✅ implemented
2. [Phase 2 — Data model](phase-2-data-model.md) ✅ implemented (2c's shelves are removed by 3a)
   - [2a — Catalog](phase-2-data-model.md#phase-2a--catalog)
   - [2b — Library](phase-2-data-model.md#phase-2b--library)
   - [2c — Shelves](phase-2-data-model.md#phase-2c--shelves)
3. **[Phase 3 — MVP: add books and browse them](phase-3-mvp.md) ⏭️ in progress**
   - 3a — Rework the model (formats, status as the list, read history) ✅ implemented
   - 3b — Add books manually ✅ implemented
   - 3c — Add books through the extension ✅ implemented, not yet run on Amazon
   - 3d — Browse, filter and move books ✅ implemented, at `/books/shelves`
4. [Phase 4 — Search and ISBN](phase-4-adding-books.md)
5. [Phase 5 — AI enrichment (Claude API)](phase-5-ai-enrichment.md)
6. [Phase 6 — Journal](phase-6-journal.md): reading log, reviews, goals
7. [Phase 7 — Quality and deploy](phase-7-quality-deploy.md)
8. [Later / nice to have](later.md)

## Architecture

The backend follows a model / service / controller layering under `inkwell/src/server/<module>/`. Biome enforces the boundaries. Every new phase builds its feature as a module in that structure. The rules are in [AGENTS.md](../../AGENTS.md#backend-architecture-model--service--controller).
