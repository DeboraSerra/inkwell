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
                status:    WANT_TO_READ | TO_READ | READING | FINISHED | DNF
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
