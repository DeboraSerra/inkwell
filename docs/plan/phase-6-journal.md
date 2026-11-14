# Phase 6 — Journal

[← Plan overview](README.md)

Goal: the journal itself, on top of the MVP and its read history: reading log, reviews and goals.

## Journal backend

Goal: the journal itself, with dated reading log entries and a review when you finish.

**Steps**

1. **`ReadingSession` model:**
   - Fields: `userBookId`, `date` (date only), `startPage?`, `endPage?`, `percent?` (0–100), `minutes?`, `note?`, `mood?` (small enum or emoji string), `createdAt`.
   - Index on `(userBookId, date)`.
   - Validation: at least one of pages, percent, minutes or note must be set, and `endPage >= startPage`.
1b. **Current position, by format (all optional),** added at the user's request on 2026-11-08. Each kind of book shows its own measure of progress:
   - **Physical book or ebook:** the current page, recorded as the session's `endPage`.
   - **Ebook:** the current percentage, the session's `percent`.
   - **Audiobook:** the time remaining, in a new optional `ReadingSession.minutesLeft` field. Progress is then (`UserBook.audioMinutes` − `minutesLeft`) ÷ `audioMinutes`. The length comes from Phase 3e.
   - **Which format is being read:** a book can be owned in several formats, so add `ReadThrough.format BookFormat?`. It's chosen when a read starts, and defaults to the only format owned. The progress fields offered follow it.
   - **Quick update:** "Update progress" on the dashboard and on a Reading book's card records a session holding just that one value, so the history keeps every update and nothing else needs filling in.
   - **Validation:** a page no higher than the page count when it's known, a percentage from 0 to 100, and time remaining no more than the audiobook's length. All of them optional.
2. **`Review` model:**
   - Fields: `userBookId @unique`, `rating` (integer 1–10, displayed as half stars), `body?`, `favoriteQuote?`, `createdAt`, `updatedAt`.
   - A rating can only be added when the status is `FINISHED` or `DNF`.
3. **Progress helper:** `getProgress(userBook)` returns the latest page, percent or time remaining from the sessions, for the read's format. It converts to a percent when the page count (the reader's, then the catalog's) or the audiobook length is known.
4. **Finish-a-book flow:** one service function sets the status to `FINISHED` (through the status rules) and optionally creates the review and a final reading session, all in one transaction.
5. **Data access:** `logSession`, `updateSession`, `deleteSession`, `listSessions(userBookId)`, `upsertReview`. Each one checks that the `UserBook` belongs to the user.
6. **Tests:** session validation, progress calculation (pages vs percent, unknown page count), and that the finish flow is atomic.

**Done when**

- You can log progress, finish a book with a review, and see the progress value the UI will show, all from tests or a script.
- `npm run build` passes.

## Goals backend

Goal: flexible reading goals with progress that's always computed.

**Steps**

1. **`ReadingGoal` model:**
   - Fields: `userId`, `metric` (`BOOKS | PAGES | MINUTES`), `period` (`YEAR | MONTH | CUSTOM`), `startDate`, `endDate`, `target`, `createdAt`.
   - Index on `(userId, startDate, endDate)`. Overlapping goals are allowed, for example a yearly books goal alongside a monthly pages goal.
2. **Default goal.** On first sign-in, or the first visit in a new year, suggest (don't create) a `BOOKS / YEAR` goal for the current year. The UI in Phase 6 confirms it.
3. **Progress, `src/server/goals/progress.rules.ts`** (queries in `goal.model.ts`, orchestration in `goal.service.ts`). Computed, never stored:
   - `BOOKS`: the number of finished reads inside the goal's dates, so a reread counts. Reads with no date, such as those from a bulk move, don't count.
   - `PAGES`: pages read in the range, from the sessions. Falls back to `pageCount` for books finished with no sessions.
   - `MINUTES`: the sum of `ReadingSession.minutes` in the range.
   - Also returns "on track / behind" by comparing progress with the share of the period that has passed.
4. **Tests:** progress for each metric, including edge cases like books finished on the period boundaries and timezones (store dates as UTC calendar dates), and on-track math.

**Done when**

- The goal progress tests pass for all three metrics.
- `npm run build` passes.

## Journal UI

- **Dashboard**: currently reading (with quick "log progress"), progress on the active goal, and recent log entries.
- **Lists**: on the MVP's TBR and Wishlist, add genre, trope, length and tag filters, sorting, drag-to-reorder priority for TBR (a `position` column on `UserBook`), and a "Pick my next read" random suggestion.
- **Book page**: metadata, AI tags, status changes (start, finish, DNF), reading log timeline, review.
- **Reading log**: quick entry (current page, percent or time remaining depending on the format, minutes, note, mood).
- **Review**: shown when you finish a book. Rating, text and favorite quote.
- **Goals**: create or edit goals; the default yearly books goal is suggested on first login.
- Server Components plus Server Actions for mutations, Tailwind 4, mobile-first (you'll log reading from your phone).
