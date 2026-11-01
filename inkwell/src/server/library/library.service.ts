import "server-only";
import { type BookFormat, type DatePrecision, ReadingStatus, UserBookSource } from "@/generated/prisma/enums";
import { findOrCreateManualBook, type ManualBookDetails } from "@/server/books/book.service";
import { authorSearchText, normalizeAuthor, normalizeAuthorName, normalizeTitle } from "@/server/books/dedupe";
import { transaction, type Tx } from "@/server/db";
import { NotFoundError, ValidationError } from "@/server/errors";
import * as libraryModel from "./library.model";
import * as readModel from "./read-through.model";
import {
  canTransition,
  changeFormats,
  initialState,
  notStartedStatusFor,
  type ReadChange,
  readChangeFor,
} from "./status.rules";
import { type ReadDates, toDateValues, toEditedReadFields, toReadFields } from "./partial-date.rules";

// Every function takes the signed-in user's id first.

const DEFAULT_PAGE_SIZE = 50;
const SHELF_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;
const MAX_BULK_BOOKS = 30;

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
  dates: ReadDates = {},
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

  const known = toReadFields(dates);
  const newReads = [
    ...[...idsFor("open"), ...reopenMissing].map((userBookId) => ({ userBookId, startedAt: at, ...known })),
    ...idsFor("addFinished").map((userBookId) => ({ userBookId, endedAt: at, outcome: "FINISHED" as const, ...known })),
    ...idsFor("addDnf").map((userBookId) => ({ userBookId, endedAt: at, outcome: "DNF" as const, ...known })),
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
  // When the status was reached, for books read or started in the past. Null
  // when that isn't known; left out, it means now.
  at?: Date | null;
  // Dates the user gave for the first read, which win over `at`.
  dates?: ReadDates;
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
  const { bookId, formats, source, status, at, dates } = input;
  const existing = await libraryModel.findUserBookByBookId(userId, bookId, outerTx);
  if (existing) return { userBook: await addFormats(userId, bookId, formats, outerTx), created: false };

  const { readChange, ...state } = initialState(formats, status);
  const created = await inTransaction(outerTx, async (tx) => {
    const userBook = await libraryModel.createUserBook({ userId, bookId, source, ...state }, tx);
    if (userBook) {
      const change = { userBookId: userBook.id, change: readChange };
      await applyReadChanges(userId, [change], at === undefined ? new Date() : at, tx, dates);
    }
    return userBook;
  });
  if (created) return { userBook: created, created: true };

  // Another request added the same book at the same moment.
  return { userBook: await addFormats(userId, bookId, formats, outerTx), created: false };
}

// Adds a typed-in book, reusing the catalog entry if the book is already known.
// Dates are only the ones the user gave, so a read can have none.
export function addManualBook(
  userId: string,
  details: ManualBookDetails,
  formats: BookFormat[],
  status?: ReadingStatus,
  dates?: ReadDates,
) {
  return transaction(async (tx) => {
    const book = await findOrCreateManualBook(details, tx);
    const added = await addBookToLibrary(
      userId,
      { bookId: book.id, formats, source: UserBookSource.MANUAL, status, at: null, dates },
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
  // Matches the title or any author's first or last name, ignoring case and accents.
  search?: string;
  take?: number;
  // The id of the last row of the previous page.
  cursor?: string;
  skip?: number;
};

function toArray<T extends string>(value: T | T[] | undefined): T[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}

const toUserBookFilter = (filters: UserBookFilters) => {
  const text = filters.search?.trim();
  return {
    status: toArray(filters.status),
    formats: filters.formats?.length ? filters.formats : undefined,
    source: filters.source,
    search: text
      ? { text, normalized: normalizeTitle(text), author: normalizeAuthorName(text), surname: normalizeAuthor(text) }
      : undefined,
  };
};

export function listUserBooks(userId: string, filters: UserBookFilters = {}) {
  return libraryModel.listUserBooks(userId, {
    ...toUserBookFilter(filters),
    take: Math.min(Math.max(filters.take ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE),
    cursor: filters.cursor,
    skip: filters.skip,
  });
}

const latestReadValues = (read?: {
  startedAt: Date | null;
  startedAtPrecision: DatePrecision;
  endedAt: Date | null;
  endedAtPrecision: DatePrecision;
}) =>
  read
    ? {
        ...toDateValues("started", read.startedAt, read.startedAtPrecision),
        ...toDateValues("ended", read.endedAt, read.endedAtPrecision),
      }
    : {};

// Authors, cover and pages are this reader's if they set them, or else the catalog's.
export type ShelfBook = {
  id: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  status: ReadingStatus;
  formats: BookFormat[];
  pageCount: number | null;
  // The latest read's dates, as the edit form's text.
  readDates: Record<string, string>;
};

// One page of a shelf, in the plain shape the page and client components share.
// A page past the end shows the last one, which happens when moving books away
// empties the page being viewed.
export async function listShelfPage(
  userId: string,
  filters: Pick<UserBookFilters, "status" | "formats" | "search">,
  requestedPage = 1,
) {
  const total = await libraryModel.countUserBooks(userId, toUserBookFilter(filters));
  const pageCount = Math.max(Math.ceil(total / SHELF_PAGE_SIZE), 1);
  const page = Math.min(Math.max(requestedPage, 1), pageCount);
  const skip = (page - 1) * SHELF_PAGE_SIZE;
  const rows = await listUserBooks(userId, { ...filters, take: SHELF_PAGE_SIZE, skip });
  const books: ShelfBook[] = rows.map(({ id, status, formats, pageCount, authors, coverUrl, readThroughs, book }) => ({
    id,
    status,
    formats,
    pageCount: pageCount ?? book.pageCount,
    readDates: latestReadValues(readThroughs.at(0)),
    title: book.title,
    authors: authors.length ? authors : book.authors,
    coverUrl: coverUrl ?? book.coverUrl,
  }));
  return { books, page, pageCount, total, firstIndex: skip + 1 };
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
  if (ids.length > MAX_BULK_BOOKS) {
    throw new ValidationError(`You can move up to ${MAX_BULK_BOOKS} books at once.`);
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

async function saveLatestReadDates(
  userId: string,
  userBookId: string,
  status: ReadingStatus,
  dates: ReadDates,
  tx: Tx,
) {
  if (status !== ReadingStatus.READING && status !== ReadingStatus.FINISHED) return;
  const read = await readModel.findLatestRead(userId, userBookId, tx);
  const fields = toEditedReadFields(dates, status === ReadingStatus.FINISHED);
  if (read) await readModel.updateReadDates(userId, read.id, fields, tx);
}

// Moves one book with the dates the reader chose. Dates left blank stay unknown.
export function moveUserBook(userId: string, userBookId: string, status: ReadingStatus, dates: ReadDates) {
  return transaction(async (tx) => {
    const current = await libraryModel.findUserBook(userId, userBookId, tx);
    if (!current) throw new NotFoundError(NOT_IN_LIBRARY);
    const change = readChangeFor(current, status);
    await applyReadChanges(userId, [{ userBookId, change }], null, tx);
    const updated = await libraryModel.updateUserBookState(userId, userBookId, { status, formats: current.formats }, tx);
    await saveLatestReadDates(userId, userBookId, status, dates, tx);
    return updated;
  });
}

export type BookEdit = {
  formats: BookFormat[];
  // Left out means not started: formats decide between Wishlist and TBR.
  status?: ReadingStatus;
  // Left out, or the same as the catalog, means the catalog's value is used.
  pageCount?: number;
  authors?: string[];
  coverUrl?: string;
  dates: ReadDates;
};

const sameList = (a: string[], b: string[]) => a.join(";") === b.join(";");

// Saves what belongs to this reader. The dates apply to the latest read, so
// earlier reads stay as they are. Throws InvalidTransitionError for a status
// change that isn't allowed.
export function editUserBook(userId: string, userBookId: string, edit: BookEdit) {
  return transaction(async (tx) => {
    const current = await libraryModel.findUserBookWithCatalog(userId, userBookId, tx);
    if (!current) throw new NotFoundError(NOT_IN_LIBRARY);

    const owned = changeFormats(current, edit.formats);
    const status = edit.status ?? notStartedStatusFor(owned.formats);
    const change = readChangeFor(owned, status);
    await applyReadChanges(userId, [{ userBookId, change }], null, tx);
    // Only real differences are kept, so later catalog fixes still reach this book.
    const { book } = current;
    const authors = edit.authors && !sameList(edit.authors, book.authors) ? edit.authors : [];
    const updated = await libraryModel.updateEditedUserBook(
      userId,
      userBookId,
      {
        status,
        formats: owned.formats,
        pageCount: edit.pageCount === book.pageCount ? null : (edit.pageCount ?? null),
        authors,
        authorSearch: authorSearchText(authors),
        coverUrl: edit.coverUrl === book.coverUrl ? null : (edit.coverUrl ?? null),
      },
      tx,
    );

    await saveLatestReadDates(userId, userBookId, status, edit.dates, tx);
    return updated;
  });
}

// Takes the book out of this user's library, with its read history. The shared
// catalog book stays, for other readers and for adding it again later.
export async function removeUserBook(userId: string, userBookId: string) {
  const removed = await libraryModel.deleteUserBook(userId, userBookId);
  if (removed === 0) throw new NotFoundError(NOT_IN_LIBRARY);
}

// The same as removeUserBook for many books. Returns how many were removed, which
// leaves out any that aren't in this user's library.
export function removeUserBooks(userId: string, userBookIds: string[]) {
  const ids = [...new Set(userBookIds)];
  if (ids.length > MAX_BULK_BOOKS) {
    throw new ValidationError(`You can delete up to ${MAX_BULK_BOOKS} books at once.`);
  }
  return libraryModel.deleteUserBooks(userId, ids);
}
