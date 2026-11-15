// Pairs up the documents a Docs re-import added twice, and works out how each
// pair merges. Pure, so prisma/merge-duplicate-docs.ts is tested without a
// database.
//
// The original is a library entry on a shared book with no ASIN (a document
// imported before documents were private); the copy is an entry on the
// reader's own private book with the same dedupe key. The original's entry is
// kept, with its status, reads and addedAt, and moves to the private book so
// the document becomes private as intended.
import type { BookFormat, DatePrecision, ReadingStatus } from "@/generated/prisma/enums";
import { changeFormats } from "@/server/library/status.rules";

export type DocEntry = {
  id: string;
  userId: string;
  bookId: string;
  book: { ownerId: string | null; asin: string | null; dedupeKey: string };
  status: ReadingStatus;
  formats: BookFormat[];
  acquiredAt: Date | null;
  acquiredAtPrecision: DatePrecision;
  readCount: number;
};

export type DocMerge<T extends DocEntry = DocEntry> = {
  userId: string;
  dedupeKey: string;
  keep: T;
  drop: T;
  data: {
    bookId: string;
    status: ReadingStatus;
    formats: BookFormat[];
    acquiredAt: Date | null;
    acquiredAtPrecision: DatePrecision;
  };
};

export type DocSkip = { userId: string; dedupeKey: string; reason: string };

const isOriginal = (entry: DocEntry) => entry.book.ownerId === null && entry.book.asin === null;
const isPrivateCopy = (entry: DocEntry) => entry.book.ownerId === entry.userId;

// The earlier purchase date of the two, as an import keeps it.
function earlierAcquired(a: DocEntry, b: DocEntry) {
  if (b.acquiredAt === null) return a;
  if (a.acquiredAt === null) return b;
  return b.acquiredAt.getTime() < a.acquiredAt.getTime() ? b : a;
}

export function mergeDocPair<T extends DocEntry>(keep: T, drop: T): DocMerge<T> {
  const { status, formats } = changeFormats(keep, [...keep.formats, ...drop.formats]);
  const { acquiredAt, acquiredAtPrecision } = earlierAcquired(keep, drop);
  return {
    userId: keep.userId,
    dedupeKey: keep.book.dedupeKey,
    keep,
    drop,
    data: { bookId: drop.bookId, status, formats, acquiredAt, acquiredAtPrecision },
  };
}

// Only clear pairs merge: one original and one private copy per reader and
// key, and a copy with no reads of its own. Anything else is reported and
// left alone. Entries on books with an ASIN or another user's private book
// aren't part of this and are ignored.
export function planDocMerges<T extends DocEntry>(entries: readonly T[]) {
  const groups = new Map<string, { originals: T[]; copies: T[] }>();
  for (const entry of entries) {
    const kind = isOriginal(entry) ? "originals" : isPrivateCopy(entry) ? "copies" : undefined;
    if (!kind) continue;
    const key = `${entry.userId}\u0000${entry.book.dedupeKey}`;
    const group = groups.get(key) ?? { originals: [], copies: [] };
    group[kind].push(entry);
    groups.set(key, group);
  }

  const merges: DocMerge<T>[] = [];
  const skips: DocSkip[] = [];
  for (const { originals, copies } of groups.values()) {
    if (!originals.length || !copies.length) continue;
    const { userId, book } = originals[0];
    const skip = (reason: string) => skips.push({ userId, dedupeKey: book.dedupeKey, reason });
    if (originals.length > 1 || copies.length > 1) {
      skip(`${originals.length} shared and ${copies.length} private copies`);
    } else if (copies[0].readCount > 0) {
      skip("the private copy has reads of its own");
    } else {
      merges.push(mergeDocPair(originals[0], copies[0]));
    }
  }
  return { merges, skips };
}
