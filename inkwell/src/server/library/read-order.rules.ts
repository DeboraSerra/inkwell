// Which read is the latest: the most recent by its dates, not the most
// recently entered, so a 2019 read added today doesn't replace the 2024 one.
// Pure, so it's unit-tested without a database.

export type OrderedRead = {
  outcome: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
};

const newestFirst = (a: Date | null, b: Date | null) => {
  if (a && b) return b.getTime() - a.getTime();
  if (a) return -1;
  return b ? 1 : 0;
};

// The open read (no outcome) first, then by end date, then by start date,
// newest first. Reads with no dates go last, newest entered first.
export function compareReads(a: OrderedRead, b: OrderedRead) {
  const open = Number(b.outcome === null) - Number(a.outcome === null);
  return (
    open ||
    newestFirst(a.endedAt, b.endedAt) ||
    newestFirst(a.startedAt, b.startedAt) ||
    b.createdAt.getTime() - a.createdAt.getTime()
  );
}

export const sortReads = <T extends OrderedRead>(reads: readonly T[]) => [...reads].sort(compareReads);

// When a book was last finished: the end date of its latest read, or null.
export const lastFinishedAt = (reads: readonly OrderedRead[]) => sortReads(reads).at(0)?.endedAt ?? null;

// Orders books by when they were last finished. Books with no finish date go
// last either way, newest added first among themselves, as the shelf usually is.
export function sortByLastFinished<T extends { id: string; addedAt: Date; readThroughs: readonly OrderedRead[] }>(
  books: readonly T[],
  direction: "asc" | "desc",
) {
  const keyed = books.map((book) => ({ book, finished: lastFinishedAt(book.readThroughs) }));
  keyed.sort((a, b) => {
    if (a.finished && b.finished) {
      const byDate = a.finished.getTime() - b.finished.getTime();
      if (byDate) return direction === "asc" ? byDate : -byDate;
    } else if (a.finished || b.finished) {
      return a.finished ? -1 : 1;
    }
    return b.book.addedAt.getTime() - a.book.addedAt.getTime() || a.book.id.localeCompare(b.book.id);
  });
  return keyed.map(({ book }) => book);
}
