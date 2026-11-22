# Phase 7 — Shelf filter fixes

[← Plan overview](README.md)

⏳ Planned (2026-11-22), no open questions. Asked by the user on 2026-11-22, to come after Phase 6 and before Phase 8 (accessibility tests). Every fix is on `/books/shelves`.

**Applies to every step**

- **Build on what's there:** `BookShelf/TopicFilter/` (`index.tsx`, `FilterList.tsx`), `BookShelf/ShelfFilterBar.tsx` and `BookShelf/index.tsx` (the empty state).
- **Pure logic goes in a rules file** (`library/shelf-filters.ts` or a new `library/topic-filter.rules.ts`), tested directly.
- Component tests update in `src/components/tests/pages/books/shelves/BookShelf/` (`TopicFilter/`, `BooksShelf.test.tsx`), keeping coverage at 95%.
- Each step ends with `npx tsc --noEmit`, `npm run lint` and `npm test` passing; the user runs `npm run build` at the end.

## 7a — Filter button and chips: size and layout

✅ Done (2026-11-22), by the user.

1. **Tap targets of at least 40px on every screen size** (answered 2026-11-22): the funnel trigger (now `size='icon'`, 32px), "Clear filters" (`size='sm'`, 28px), and each `FilterChip` (about 24px) grow to 40px (`min-h-10`, `size-10` for the trigger).
2. **The count badge** stays readable and inside the larger trigger, not clipped by the screen edge.
3. **No layout shift when filters are ticked** (answered 2026-11-22): today "Clear filters" appears beside the funnel and pushes the row, so the bar takes more room than it should. Redesign so the row keeps its size: "Clear filters" moves inside the popover (top, next to the headings), and the funnel shows only the count badge.

**Outcome (7a)**

- Built by the user, differently from the steps above. Every `size='icon'` button is now 40px (`icon: "size-10"` in `ui/button.tsx`), the filter chips keep their size, and "Clear filters" stays beside the funnel.
- On phones, the format checkboxes and the filter and sort controls sit on two rows (`flex-col md:flex-row`), with the controls on the right. The shelf grid has two columns from `lg` rather than `md`.
- Book cards: the actions trigger is larger (24px box, 20px icon), and the read dates, genre and tags are labelled ("Read at:", "Genre (trope):", "Tags:"), with "+N" earlier reads as its own pill.

## 7b — Unticking a genre clears its tropes

1. Clearing every genre also clears every trope, since tropes are only shown when a genre is ticked.
2. Unticking one genre of several drops the ticked tropes that belong to none of the genres still ticked, and keeps the rest (answered 2026-11-22).
3. A pure rule, `tropesForGenres(topics, genres, tropes)`, does the pruning; `TopicFilter` calls it in the genre chip's `onToggle`, so the URL never holds an orphan trope.
4. The "currently ticked trope stays visible so it can be unticked" case in `shownTropes` goes away, since a trope can no longer be ticked without its genre. A URL with an orphan trope (old link, back button) is still shown so it can be unticked.

## 7c — "No match" instead of "no books"

1. **Today** `BooksShelf` only treats a search or a format as a filter, so a genre or trope filter with no result says "Nothing on TBR yet." with "Add a book".
2. Any of search, formats, genres or tropes being set counts as filtering (a shared `hasFilters(filters)` in `library/shelf-filters.ts`).
3. One generic line, `No books on <list> match these filters.` (`No owned books match these filters.` on Owned), with a "Clear filters" button that clears search, formats, genres and tropes and keeps the shelf, the sort and the per-page (answered 2026-11-22).
4. "Nothing on <list> yet." with "Add a book" stays for a shelf that's truly empty.

## 7d — Only the genres in my library

1. **A service read:** `library.service.listLibraryTopics(userId)` returns the genres in use in the reader's library, by each book's effective genre (the reader's when `genreEdited` is set, otherwise the catalog's, through `library/book-topics.rules.ts`), and the same for tropes. The model query filters by `userId`.
2. **A switch in the popover,** "Only genres in my books", on by default; turning it off shows the full curated list. The choice is remembered in a cookie, like `shelfPerPage` (answered 2026-11-22).
3. **Scope: the whole library,** so the list is the same on every shelf (answered 2026-11-22).
4. Tropes follow the same choice, still narrowed by the ticked genres through `GenreTrope`.
5. The page loads both lists (`listTopics()` and the reader's), so the switch doesn't need another request. The edit dialog's pickers keep the full curated list.

### Answered (2026-11-22)

1. Filter button: it takes more room when filters are ticked; redesign to avoid the shift (7a.3).
2. 40px on every screen size, not only phones.
3. Unticking one genre of several drops only the tropes none of the remaining genres has.
4. One generic no-match line, with a "Clear filters" button.
5. A switch, with only the reader's genres by default.
6. The whole library.
