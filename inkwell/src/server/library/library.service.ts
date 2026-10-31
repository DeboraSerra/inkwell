import "server-only";
import { type BookFormat, type ReadingStatus, UserBookSource } from "@/generated/prisma/enums";
import { findOrCreateManualBook, type ManualBookDetails } from "@/server/books/book.service";
import { normalizeTitle } from "@/server/books/dedupe";
import { transaction, type Tx } from "@/server/db";
import { NotFoundError, ValidationError } from "@/server/errors";
import * as libraryModel from "./library.model";
import * as readModel from "./read-through.model";
import {
  canTransition,
  changeFormats,
  initialState,
  type ReadChange,
  readChangeFor,
} from "./status.rules";

// Every function takes the signed-in user's id first.

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_BULK_MOVE = 30;

const NOT_IN_LIBRARY = "Book not found in your library";

// Joins the caller's transaction if there is one, or starts a new one.
const inTransaction = <T>(tx: Tx | undefined, fn: (tx: Tx) => Promise<T>) =>
  tx ? fn(tx) : transaction(fn);

// Applies status-change effects to the read history in a fixed number of
// queries however many books move, so a bulk move fits in one transaction.
// `at` is when it happened, or null when that isn't known.
async function applyReadChanges(
  userId: string,
  changes: { userBookId: string; change: ReadChange }[],
  at: Date | null,
  tx: Tx,
) {
  const idsFor = (...kinds: ReadChange[]) =>
    changes.filter(({ change }) => kinds.includes(change)).map(({ userBookId }) => userBookId);

  const toClose = idsFor("closeFinished", "closeDnf");
  const toReopen = idsFor("reopen");
  const existing =
    toClose.length || toReopen.length
      ? await readModel.findChangeableReads(userId, [...toClose, ...toReopen], tx)
      : [];
  // Newest first, so a later read of the same book never replaces the first match.
  const latest = (userBookId: string, outcome: "DNF" | null) =>
    existing.find((read) => read.userBookId === userBookId && read.outcome === outcome);

  const reopened = toReopen.flatMap((id) => latest(id, "DNF")?.id ?? []);
  const reopenMissing = toReopen.filter((id) => !latest(id, "DNF"));

  const closeAs = async (ids: string[], outcome: "FINISHED" | "DNF") => {
    const readIds = ids.flatMap((id) => latest(id, null)?.id ?? []);
    if (readIds.length) await readModel.closeReads(userId, readIds, outcome, at, tx);
    return ids
      .filter((id) => !latest(id, null))
      .map((userBookId) => ({ userBookId, endedAt: at, outcome }));
  };
  const closedWithoutOpenRead = [
    ...(await closeAs(idsFor("closeFinished"), "FINISHED")),
    ...(await closeAs(idsFor("closeDnf"), "DNF")),
  ];

  if (reopened.length) await readModel.reopenReads(userId, reopened, tx);

  const discard = idsFor("discardOpen");
  if (discard.length) await readModel.deleteOpenReads(userId, discard, tx);

  const newReads = [
    ...[...idsFor("open"), ...reopenMissing].map((userBookId) => ({ userBookId, startedAt: at })),
    ...idsFor("addFinished").map((userBookId) => ({ userBookId, endedAt: at, outcome: "FINISHED" as const })),
    ...idsFor("addDnf").map((userBookId) => ({ userBookId, endedAt: at, outcome: "DNF" as const })),
    ...closedWithoutOpenRead,
  ];
  if (newReads.length) await readModel.createReads(newReads, tx);
}

export type AddBookInput = {
  bookId: string;
  // Empty means the book isn't owned, so it goes on the Wishlist.
  formats: BookFormat[];
  source: UserBookSource;
  status?: ReadingStatus;
  // When the status was reached, for books read or started in the past.
  at?: Date;
};

// Adding a book already in the library only ever adds formats. Its status,
// source and reads are never overwritten, except that gaining a first format
// moves a Wishlist book to TBR.
function addFormats(userId: string, bookId: string, formats: BookFormat[], outerTx?: Tx) {
  return inTransaction(outerTx, async (tx) => {
    const current = await libraryModel.findUserBookByBookId(userId, bookId, tx);
    if (!current) throw new NotFoundError(NOT_IN_LIBRARY);
    const next = changeFormats(current, [...current.formats, ...formats]);
    if (next.formats.length === current.formats.length) return current;
    return libraryModel.updateUserBookState(userId, current.id, next, tx);
  });
}

// Throws InvalidTransitionError for a status that doesn't fit the formats.
export async function addBookToLibrary(userId: string, input: AddBookInput, outerTx?: Tx) {
  const { bookId, formats, source, status, at } = input;
  const existing = await libraryModel.findUserBookByBookId(userId, bookId, outerTx);
  if (existing) return { userBook: await addFormats(userId, bookId, formats, outerTx), created: false };

  const { readChange, ...state } = initialState(formats, status);
  const created = await inTransaction(outerTx, async (tx) => {
    const userBook = await libraryModel.createUserBook({ userId, bookId, source, ...state }, tx);
    if (userBook) {
      const change = { userBookId: userBook.id, change: readChange };
      await applyReadChanges(userId, [change], at ?? new Date(), tx);
    }
    return userBook;
  });
  if (created) return { userBook: created, created: true };

  // Another request added the same book at the same moment.
  return { userBook: await addFormats(userId, bookId, formats, outerTx), created: false };
}

// Adds a typed-in book, reusing the catalog entry if the book is already known.
export function addManualBook(userId: string, details: ManualBookDetails, formats: BookFormat[]) {
  return transaction(async (tx) => {
    const book = await findOrCreateManualBook(details, tx);
    const added = await addBookToLibrary(
      userId,
      { bookId: book.id, formats, source: UserBookSource.MANUAL },
      tx,
    );
    return { ...added, book };
  });
}

export function getUserBook(userId: string, userBookId: string) {
  return libraryModel.findUserBookWithCatalog(userId, userBookId);
}

export type UserBookFilters = {
  status?: ReadingStatus | ReadingStatus[];
  // Owned in any of these formats.
  formats?: BookFormat[];
  source?: UserBookSource;
  // Matches the title or the first author's surname, ignoring case and accents.
  search?: string;
  take?: number;
  // The id of the last row of the previous page.
  cursor?: string;
};

function toArray<T extends string>(value: T | T[] | undefined): T[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}

export function listUserBooks(userId: string, filters: UserBookFilters = {}) {
  const text = filters.search?.trim();
  return libraryModel.listUserBooks(userId, {
    status: toArray(filters.status),
    formats: filters.formats?.length ? filters.formats : undefined,
    source: filters.source,
    search: text ? { text, normalized: normalizeTitle(text) } : undefined,
    take: Math.min(Math.max(filters.take ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE),
    cursor: filters.cursor,
  });
}

// Throws InvalidTransitionError for a change that isn't allowed. `at` lets a
// past date be recorded.
export function updateStatus(
  userId: string,
  userBookId: string,
  status: ReadingStatus,
  at: Date = new Date(),
) {
  return transaction(async (tx) => {
    const current = await libraryModel.findUserBook(userId, userBookId, tx);
    if (!current) throw new NotFoundError(NOT_IN_LIBRARY);
    const change = readChangeFor(current, status);
    if (current.status === status) return current;
    await applyReadChanges(userId, [{ userBookId, change }], at, tx);
    return libraryModel.updateUserBookState(userId, userBookId, { status, formats: current.formats }, tx);
  });
}

export type SkippedBook = { userBookId: string; reason: string };

// Moves many books at once. Books that can't move are reported, not fatal.
// Records no dates: a bulk move doesn't know when each book was read.
export async function updateStatuses(
  userId: string,
  userBookIds: string[],
  status: ReadingStatus,
) {
  const ids = [...new Set(userBookIds)];
  if (ids.length > MAX_BULK_MOVE) {
    throw new ValidationError(`You can move up to ${MAX_BULK_MOVE} books at once.`);
  }

  return transaction(async (tx) => {
    const books = await libraryModel.findUserBooks(userId, ids, tx);
    const byId = new Map(books.map((book) => [book.id, book]));
    const changes: { userBookId: string; change: ReadChange }[] = [];
    const skipped: SkippedBook[] = [];
    for (const userBookId of ids) {
      const book = byId.get(userBookId);
      if (!book) skipped.push({ userBookId, reason: NOT_IN_LIBRARY });
      else if (book.status === status) skipped.push({ userBookId, reason: "Already on that list" });
      else if (!canTransition(book, status)) skipped.push({ userBookId, reason: "Can't move to that list" });
      else changes.push({ userBookId, change: readChangeFor(book, status) });
    }
    const moved = changes.map(({ userBookId }) => userBookId);
    if (moved.length) {
      await applyReadChanges(userId, changes, null, tx);
      await libraryModel.updateUserBookStatuses(userId, moved, status, tx);
    }
    return { moved, skipped };
  });
}

export function updateFormats(userId: string, userBookId: string, formats: BookFormat[]) {
  return transaction(async (tx) => {
    const current = await libraryModel.findUserBook(userId, userBookId, tx);
    if (!current) throw new NotFoundError(NOT_IN_LIBRARY);
    return libraryModel.updateUserBookState(userId, userBookId, changeFormats(current, formats), tx);
  });
}
