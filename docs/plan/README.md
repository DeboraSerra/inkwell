# Inkwell — Online Reading Journal: Plan

## Decisions

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

## Phases

0. [Phase 0 — Fix the security issues](phase-0-security.md) ✅ done
1. [Phase 1 — Foundation and auth](phase-1-foundation-auth.md) ✅ implemented
2. [Phase 2 — Data model redesign (built to scale)](phase-2-data-model.md)
   - [2a — Catalog](phase-2-data-model.md#phase-2a--catalog) ✅ implemented
   - [2b — Library](phase-2-data-model.md#phase-2b--library)
   - [2c — Shelves](phase-2-data-model.md#phase-2c--shelves)
   - [2d — Journal](phase-2-data-model.md#phase-2d--journal)
   - [2e — Goals and imports](phase-2-data-model.md#phase-2e--goals-and-imports)
3. [Phase 3 — Extension → app import](phase-3-extension-import.md)
4. [Phase 4 — Adding books by search, ISBN and manual entry](phase-4-adding-books.md)
5. [Phase 5 — AI enrichment (Claude API)](phase-5-ai-enrichment.md)
6. [Phase 6 — Journal UI](phase-6-journal-ui.md)
7. [Phase 7 — Quality and deploy](phase-7-quality-deploy.md)
8. [Later / nice to have](later.md)
