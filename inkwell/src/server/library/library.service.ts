import "server-only";
import { type BookFormat, DatePrecision, ReadingStatus, ReadOutcome, UserBookSource } from "@/generated/prisma/enums";
import {
  fillMissingDescription,
  fillMissingIsbn,
  findExistingBook,
  findOrCreateManualBook,
  findOrCreateMetadataBook,
  type ManualBookDetails,
} from "@/server/books/book.service";
import { authorSearchText, dedupeKey, normalizeAuthor, normalizeAuthorName, normalizeTitle } from "@/server/books/dedupe";
import { transaction, type Tx } from "@/server/db";
import { NotFoundError, ValidationError } from "@/server/errors";
import { lookupById, lookupIsbn, searchBooks } from "@/server/metadata/metadata.service";
import type { BookMetadata, MetadataSourceName } from "@/server/metadata/metadata.types";
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
import { type PartialDate, type ReadDates, toDateValues, toEditedReadFields, toReadFields } from "./partial-date.rules";
import type { ShelfRead } from "./read-label.rules";
import { sortByLastFinished, sortReads } from "./read-order.rules";
import { type PageSize, parsePageSize, type ShelfSort } from "./shelf-filters";

// Every function takes the signed-in user's id first.

const DEFAULT_SHELF_PAGE_SIZE: PageSize = 30;

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_BULK_BOOKS = 30;

const NOT_IN_LIBRARY = "Book not found in your library";

// Joins the caller's transaction if there is one, or starts a new one.
const inTransaction = <T>(tx: Tx | undefined, fn: (tx: Tx) => Promise<T>) =>
  tx ? fn(tx) : transaction(fn);

// The read a status change acted on: an existing one by id, or "created" for
// the read it added, which is then the book's newest entry.
type ActedOn = Map<string, string>;
const CREATED = "created";

// Applies status-change effects to the read history in a fixed number of
// queries however many books move, so a bulk move fits in one transaction.
// `at` is when it happened, or null when that isn't known. Returns, per book,
// the read the change acted on, so dates given with the change go to it.
async function applyReadChanges(
  userId: string,
  changes: { userBookId: string; change: ReadChange }[],
  at: Date | null,
  tx: Tx,
  dates: ReadDates = {},
): Promise<ActedOn> {
  const actedOn: ActedOn = new Map();
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

  for (const id of toReopen) {
    const read = latest(id, "DNF");
    if (read) actedOn.set(id, read.id);
  }

  const closeAs = async (ids: string[], outcome: "FINISHED" | "DNF") => {
    for (const id of ids) {
      const open = latest(id, null);
      if (open) actedOn.set(id, open.id);
    }
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
  for (const { userBookId } of newReads) actedOn.set(userBookId, CREATED);
  return actedOn;
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
  // An audiobook's length in minutes, when the reader gave one.
  audioMinutes?: number;
  // More finished reads, for a book added as already read more than once.
  pastReads?: PastRead[];
  // When the reader got the book, if known.
  acquired?: PartialDate;
};

// The earliest known date is when the book became the reader's, so a later
// date (another format bought since) never replaces an earlier one.
const isEarlierAcquired = (current: Date | null, candidate?: PartialDate) =>
  candidate !== undefined && (current === null || candidate.date.getTime() < current.getTime());

const acquiredFields = (acquired?: PartialDate) => ({
  acquiredAt: acquired?.date ?? null,
  acquiredAtPrecision: acquired?.precision ?? DatePrecision.DAY,
});

// Adding a book already in the library only ever adds formats, and an
// acquired date when it has none or the new one is earlier. Its status, source,
// reads and place on the shelf (addedAt) are never overwritten, except that
// gaining a first format moves a Wishlist book to TBR.
function addFormats(
  userId: string,
  bookId: string,
  formats: BookFormat[],
  outerTx?: Tx,
  acquired?: PartialDate,
) {
  return inTransaction(outerTx, async (tx) => {
    let current = await libraryModel.findUserBookByBookId(userId, bookId, tx);
    if (!current) throw new NotFoundError(NOT_IN_LIBRARY);
    if (isEarlierAcquired(current.acquiredAt, acquired)) {
      current = await libraryModel.updateAcquired(userId, current.id, acquiredFields(acquired), tx);
    }
    const next = changeFormats(current, [...current.formats, ...formats]);
    if (next.formats.length === current.formats.length) return current;
    return libraryModel.updateUserBookState(userId, current.id, next, tx);
  });
}

// Throws InvalidTransitionError for a status that doesn't fit the formats.
// A book already in the library keeps its length, as it keeps its status and
// dates: adding again only adds formats.
export async function addBookToLibrary(userId: string, input: AddBookInput, outerTx?: Tx) {
  const { bookId, formats, source, status, at, dates, audioMinutes, pastReads, acquired } = input;
  const existing = await libraryModel.findUserBookByBookId(userId, bookId, outerTx);
  if (existing) return { userBook: await addFormats(userId, bookId, formats, outerTx, acquired), created: false };

  const { readChange, ...state } = initialState(formats, status);
  const created = await inTransaction(outerTx, async (tx) => {
    const userBook = await libraryModel.createUserBook(
      { userId, bookId, source, audioMinutes, ...(acquired && acquiredFields(acquired)), ...state },
      tx,
    );
    if (userBook) {
      const change = { userBookId: userBook.id, change: readChange };
      await applyReadChanges(userId, [change], at === undefined ? new Date() : at, tx, dates);
      if (state.status === ReadingStatus.FINISHED && pastReads?.length) {
        await savePastReads(userId, userBook.id, pastReads.filter(({ id }) => !id), tx);
      }
    }
    return userBook;
  });
  if (created) return { userBook: created, created: true };

  // Another request added the same book at the same moment.
  return { userBook: await addFormats(userId, bookId, formats, outerTx, acquired), created: false };
}

// Adds a typed-in book, reusing the catalog entry if the book is already known.
// Dates are only the ones the user gave, so a read can have none.
export function addManualBook(
  userId: string,
  details: ManualBookDetails,
  formats: BookFormat[],
  status?: ReadingStatus,
  dates?: ReadDates,
  audioMinutes?: number,
  pastReads?: PastRead[],
  acquired?: PartialDate,
) {
  return transaction(async (tx) => {
    const book = await findOrCreateManualBook(details, tx);
    const added = await addBookToLibrary(
      userId,
      { bookId: book.id, formats, source: UserBookSource.MANUAL, status, at: null, dates, audioMinutes, pastReads, acquired },
      tx,
    );
    return { ...added, book };
  });
}

// A provider's record, for a search result added without an ISBN.
export type ProviderRef = { source: MetadataSourceName; sourceId: string };

export type IsbnPreview = {
  // Missing for a search result with no ISBN, which is added by `ref` instead.
  isbn13?: string;
  ref?: ProviderRef;
  title: string;
  subtitle?: string;
  authors: string[];
  coverUrl?: string;
  pageCount?: number;
  publishedYear?: number;
  // Where the details shown come from.
  from: "CATALOG" | "OPEN_LIBRARY" | "GOOGLE_BOOKS";
  // The reader's copy, when the book is already in their library.
  inLibrary?: { status: ReadingStatus; formats: BookFormat[] };
};

export type IsbnPreviewResult = { found: true; preview: IsbnPreview } | { found: false; isbn13: string };

type FoundLookup = Exclude<Awaited<ReturnType<typeof lookupIsbn>>, { found: "none" }>;

// What adding this book would add. A provider's book that matches a catalog
// book by title and author shows the catalog's details, since adding reuses
// that book unchanged; and a book already in the library shows the reader's
// own cover, authors and pages first.
async function previewLookup(userId: string, lookup: FoundLookup): Promise<IsbnPreview> {
  const metadata = lookup.found === "provider" ? lookup.metadata : null;
  const match = lookup.found === "catalog" ? lookup.book : await findExistingBook(lookup.metadata);
  const catalog = match && !match.ownerId ? match : null;
  const userBook = catalog ? await libraryModel.findUserBookByBookId(userId, catalog.id) : null;

  const details = catalog
    ? {
        title: catalog.title,
        subtitle: catalog.subtitle ?? undefined,
        authors: catalog.authors,
        coverUrl: catalog.coverUrl ?? undefined,
        pageCount: catalog.pageCount ?? undefined,
        publishedYear: catalog.publishedYear ?? undefined,
      }
    : // A catalog lookup always has a shared book, so only a provider's gets here.
      (metadata as BookMetadata);

  return {
    isbn13: (catalog?.isbn13 ?? metadata?.isbn13) || undefined,
    title: details.title,
    subtitle: details.subtitle,
    authors: userBook?.authors.length ? userBook.authors : details.authors,
    coverUrl: userBook?.coverUrl ?? details.coverUrl,
    pageCount: userBook?.pageCount ?? details.pageCount,
    publishedYear: details.publishedYear,
    from: catalog ? "CATALOG" : (metadata?.source ?? "CATALOG"),
    inLibrary: userBook ? { status: userBook.status, formats: userBook.formats } : undefined,
  };
}

export async function previewIsbn(userId: string, isbn: string): Promise<IsbnPreviewResult> {
  const lookup = await lookupIsbn(isbn);
  if (lookup.found === "none") return { found: false, isbn13: lookup.isbn13 };
  const preview = await previewLookup(userId, lookup);
  // The ISBN asked for, even when the matched catalog book has none yet.
  const isbn13 = (lookup.found === "catalog" ? lookup.book.isbn13 : lookup.metadata.isbn13) ?? "";
  return { found: true, preview: { ...preview, isbn13 } };
}

// A search result, shown the way an ISBN lookup is. One with an ISBN is looked
// up by it, for the edition's own details; one without, or whose ISBN no
// provider knows, by its provider record, which adding then uses too. The
// preview always keeps the result's ref, which the search form sends back.
export async function previewSearchResult(userId: string, ref: ProviderRef, isbn13?: string) {
  if (isbn13) {
    const byIsbn = await previewIsbn(userId, isbn13);
    if (byIsbn.found) return { ...byIsbn.preview, ref };
  }
  const metadata = await lookupById(ref.source, ref.sourceId);
  if (!metadata) throw new NotFoundError("That book is no longer available. Try searching again.");
  const preview = await previewLookup(userId, { found: "provider", metadata });
  return { ...preview, isbn13: undefined, ref };
}

export type SearchResult = ProviderRef & {
  title: string;
  subtitle?: string;
  authors: string[];
  coverUrl?: string;
  publishedYear?: number;
  isbn13?: string;
  // The list it's on, when the reader already has it.
  inLibrary?: ReadingStatus;
};

// Searches the providers and marks the results the reader already has, by
// ISBN or by title and authors, in one query. Private books only ever match
// their owner's own library, which is the only one looked at here.
export async function searchForLibrary(userId: string, query: string): Promise<SearchResult[]> {
  const results = await searchBooks(query);
  if (results.length === 0) return [];
  const keys = results.map((result) => dedupeKey(result.title, result.authors));
  const isbns = results.flatMap((result) => result.isbn13 ?? []);
  const owned = await libraryModel.findUserBooksMatching(userId, { isbn13s: isbns, dedupeKeys: keys });

  return results.map((result, index) => {
    const mine = owned.find(
      ({ book }) => (result.isbn13 && book.isbn13 === result.isbn13) || book.dedupeKey === keys[index],
    );
    return {
      source: result.source,
      sourceId: result.sourceId,
      title: result.title,
      subtitle: result.subtitle,
      authors: result.authors,
      coverUrl: result.coverUrl,
      publishedYear: result.publishedYear,
      isbn13: result.isbn13,
      inLibrary: mine?.status,
    };
  });
}

export type LookupChoices = {
  formats: BookFormat[];
  status?: ReadingStatus;
  dates?: ReadDates;
  audioMinutes?: number;
  pastReads?: PastRead[];
  acquired?: PartialDate;
  source?: typeof UserBookSource.ISBN | typeof UserBookSource.SEARCH;
};

// Adds a book by ISBN. The book's details always come from the server's own
// lookup, never from the request, so the shared catalog only holds what a
// provider said. The lookup runs before the transaction, so no network call
// holds it open.
export async function addBookByIsbn(userId: string, isbn: string, choices: LookupChoices) {
  const { formats, status, dates, audioMinutes, pastReads, acquired, source = UserBookSource.ISBN } = choices;
  const lookup = await lookupIsbn(isbn);
  if (lookup.found === "none") throw new NotFoundError("We couldn't find a book with that ISBN.");

  const added = await transaction(async (tx) => {
    const book = lookup.found === "catalog" ? lookup.book : await findOrCreateMetadataBook(lookup.metadata, tx);
    const result = await addBookToLibrary(
      userId,
      { bookId: book.id, formats, source, status, at: null, dates, audioMinutes, pastReads, acquired },
      tx,
    );
    return { ...result, book };
  });
  if (lookup.found === "provider") await fillMissingIsbn(added.book, lookup.metadata);
  // The record it was found with, for saving the synopsis after the add.
  return { ...added, metadata: lookup.found === "provider" ? lookup.metadata : undefined };
}

// Adds a search result with no ISBN by its provider record, looked up again
// here so the catalog only holds what the provider said. It dedupes like any
// provider book: by ISBN if the record has one, then by title and authors.
export async function addBookFromProvider(userId: string, ref: ProviderRef, choices: LookupChoices) {
  const { formats, status, dates, audioMinutes, pastReads, acquired } = choices;
  const metadata = await lookupById(ref.source, ref.sourceId);
  if (!metadata) throw new NotFoundError("That book is no longer available. Try searching again.");

  const added = await transaction(async (tx) => {
    const book = await findOrCreateMetadataBook(metadata, tx);
    const result = await addBookToLibrary(
      userId,
      { bookId: book.id, formats, source: UserBookSource.SEARCH, status, at: null, dates, audioMinutes, pastReads, acquired },
      tx,
    );
    return { ...result, book };
  });
  await fillMissingIsbn(added.book, metadata);
  return { ...added, metadata };
}

// Saves a just-added book's synopsis, if its shared record has none. Meant to
// run after the add's response is sent (see the controllers).
export function saveSynopsis(added: { book: Parameters<typeof fillMissingDescription>[0]; metadata?: BookMetadata }) {
  return fillMissingDescription(added.book, added.metadata);
}

export function getUserBook(userId: string, userBookId: string) {
  return libraryModel.findUserBookWithCatalog(userId, userBookId);
}

export type UserBookFilters = {
  status?: ReadingStatus | ReadingStatus[];
  // Owned in any of these formats.
  formats?: BookFormat[];
  // Owned in at least one format, whatever the list (the Owned shelf).
  owned?: boolean;
  source?: UserBookSource;
  // Matches the title or any author's first or last name, ignoring case and accents.
  search?: string;
  sort?: ShelfSort;
  take?: number;
  // The id of the last row of the previous page.
  cursor?: string;
  skip?: number;
};

function toArray<T extends string>(value: T | T[] | undefined): T[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}

// "acquired-asc" → by purchase date, oldest first.
const toSortOrder = (sort?: ShelfSort) => {
  if (!sort) return undefined;
  const [by, direction] = sort.split("-") as ["added" | "acquired" | "title" | "read", "asc" | "desc"];
  return { by, direction };
};

// The orders the database runs itself; ordering by read dates is done here.
const databaseOrder = (sort?: ShelfSort) => {
  const order = toSortOrder(sort);
  return order && order.by !== "read" ? { by: order.by, direction: order.direction } : undefined;
};

const toUserBookFilter = (filters: UserBookFilters) => {
  const text = filters.search?.trim();
  return {
    status: toArray(filters.status),
    formats: filters.formats?.length ? filters.formats : undefined,
    owned: filters.owned || undefined,
    source: filters.source,
    search: text
      ? { text, normalized: normalizeTitle(text), author: normalizeAuthorName(text), surname: normalizeAuthor(text) }
      : undefined,
  };
};

export function listUserBooks(userId: string, filters: UserBookFilters = {}) {
  return libraryModel.listUserBooks(userId, {
    ...toUserBookFilter(filters),
    sort: databaseOrder(filters.sort),
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

type StoredRead = {
  startedAt: Date | null;
  startedAtPrecision: DatePrecision;
  endedAt: Date | null;
  endedAtPrecision: DatePrecision;
};

// Only the dates that are known, each with how much of it is known.
const toShelfRead = (read?: StoredRead): ShelfRead | null =>
  read
    ? {
        ...(read.startedAt && { started: { date: read.startedAt, precision: read.startedAtPrecision } }),
        ...(read.endedAt && { ended: { date: read.endedAt, precision: read.endedAtPrecision } }),
      }
    : null;

// Authors, cover and pages are this reader's if they set them, or else the catalog's.
export type ShelfBook = {
  id: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  status: ReadingStatus;
  formats: BookFormat[];
  pageCount: number | null;
  // An audiobook's length in minutes, or null.
  audioMinutes: number | null;
  // The latest read's dates, as the edit form's text.
  readDates: Record<string, string>;
  // The latest read's dates, for the card to show at their precision.
  latestRead: ShelfRead | null;
  // How many reads there are besides the latest one.
  earlierReads: number;
  // The earlier finished reads, most recent first, as the edit form's text.
  pastReads: { id: string; values: Record<string, string> }[];
  // When the reader got the book, as the edit form's text.
  acquiredValues: Record<string, string>;
};

// Loads these books in full, in the order given.
async function findInOrder(userId: string, ids: string[]) {
  const found = await libraryModel.findUserBooksWithCatalog(userId, ids);
  const byId = new Map(found.map((row) => [row.id, row]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

// One page of a shelf, in the plain shape the page and client components share.
// A page past the end shows the last one, which happens when moving books away
// empties the page being viewed. Only the allowed page sizes are used.
export async function listShelfPage(
  userId: string,
  filters: Pick<UserBookFilters, "status" | "owned" | "formats" | "search" | "sort">,
  requestedPage = 1,
  requestedSize: number = DEFAULT_SHELF_PAGE_SIZE,
) {
  const pageSize = parsePageSize(requestedSize) ?? DEFAULT_SHELF_PAGE_SIZE;
  const order = toSortOrder(filters.sort);
  // By read dates, every matching book is ordered here and only the page's
  // books are loaded in full; otherwise the database orders and pages.
  const byRead =
    order?.by === "read"
      ? sortByLastFinished(await libraryModel.listUserBookReadDates(userId, toUserBookFilter(filters)), order.direction)
      : undefined;
  const total = byRead ? byRead.length : await libraryModel.countUserBooks(userId, toUserBookFilter(filters));
  const pageCount = Math.max(Math.ceil(total / pageSize), 1);
  const page = Math.min(Math.max(requestedPage, 1), pageCount);
  const skip = (page - 1) * pageSize;
  const rows = byRead
    ? await findInOrder(userId, byRead.slice(skip, skip + pageSize).map(({ id }) => id))
    : await listUserBooks(userId, { ...filters, take: pageSize, skip });
  const books: ShelfBook[] = rows.map((row) => {
    const { id, status, formats, pageCount, audioMinutes, authors, coverUrl, readThroughs, book } = row;
    // The latest read is the most recent by date, not the most recently entered.
    const [latest, ...earlier] = sortReads(readThroughs);
    return {
      id,
      status,
      formats,
      pageCount: pageCount ?? book.pageCount,
      audioMinutes,
      readDates: latestReadValues(latest),
      latestRead: toShelfRead(latest),
      earlierReads: earlier.length,
      pastReads: earlier
        .filter((read) => read.outcome === ReadOutcome.FINISHED)
        .map((read) => ({ id: read.id, values: latestReadValues(read) })),
      acquiredValues: toDateValues("acquired", row.acquiredAt, row.acquiredAtPrecision),
      title: book.title,
      authors: authors.length ? authors : book.authors,
      coverUrl: coverUrl ?? book.coverUrl,
    };
  });
  return { books, page, pageCount, pageSize, total, firstIndex: skip + 1 };
}

// Throws InvalidTransitionError for a change that isn't allowed. Records no
// date unless `at` is given: the moment of the move isn't when a book was
// finished or given up, so it's never saved as if it were.
export function updateStatus(
  userId: string,
  userBookId: string,
  status: ReadingStatus,
  at: Date | null = null,
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

// The latest read by date, as the shelf shows it: the open read first, then the
// most recent dates.
async function findLatestRead(userId: string, userBookId: string, tx: Tx) {
  return sortReads(await readModel.findBookReads(userId, userBookId, tx)).at(0);
}

// Saves the dates the form showed for the latest read. After a status change
// they go to the read that change acted on: the one it closed or reopened, or
// the one it added. Without a change, to the latest read by date, which is the
// one the form showed.
async function saveLatestReadDates(
  userId: string,
  userBookId: string,
  status: ReadingStatus,
  dates: ReadDates,
  tx: Tx,
  actedOn?: string,
) {
  if (status !== ReadingStatus.READING && status !== ReadingStatus.FINISHED) return;
  let readId = actedOn;
  if (actedOn === CREATED) readId = (await readModel.findNewestRead(userId, userBookId, tx))?.id;
  if (!actedOn) readId = (await findLatestRead(userId, userBookId, tx))?.id;
  const fields = toEditedReadFields(dates, status === ReadingStatus.FINISHED);
  if (readId) await readModel.updateBookReadDates(userId, userBookId, readId, fields, tx);
}

// Another finished read in the book's history, besides the latest one: new
// when it has no id, or an earlier read's corrected dates when it has one.
export type PastRead = { id?: string; dates: ReadDates };

const READ_NOT_FOUND = "That read isn't in your library.";

// Never changes the book's status or formats, never touches the open read,
// and never removes a read. An id must be one of this book's finished reads.
async function savePastReads(userId: string, userBookId: string, pastReads: PastRead[], tx: Tx) {
  const edited = pastReads.filter((read): read is Required<PastRead> => Boolean(read.id));
  if (edited.length) {
    const finished = new Set(
      (await readModel.findBookReads(userId, userBookId, tx))
        .filter((read) => read.outcome === ReadOutcome.FINISHED)
        .map((read) => read.id),
    );
    for (const { id, dates } of edited) {
      if (!finished.has(id)) throw new NotFoundError(READ_NOT_FOUND);
      await readModel.updateBookReadDates(userId, userBookId, id, toEditedReadFields(dates, true), tx);
    }
  }
  const added = pastReads.filter(({ id }) => !id);
  if (added.length) {
    await readModel.createReads(
      added.map(({ dates }) => ({ userBookId, outcome: ReadOutcome.FINISHED, ...toReadFields(dates) })),
      tx,
    );
  }
}


// Moves one book with the dates the reader chose. Dates left blank stay unknown.
export function moveUserBook(userId: string, userBookId: string, status: ReadingStatus, dates: ReadDates) {
  return transaction(async (tx) => {
    const current = await libraryModel.findUserBook(userId, userBookId, tx);
    if (!current) throw new NotFoundError(NOT_IN_LIBRARY);
    const change = readChangeFor(current, status);
    const actedOn = await applyReadChanges(userId, [{ userBookId, change }], null, tx);
    const updated = await libraryModel.updateUserBookState(userId, userBookId, { status, formats: current.formats }, tx);
    await saveLatestReadDates(userId, userBookId, status, dates, tx, actedOn.get(userBookId));
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
  // Left out means no length, which clears a stored one.
  audioMinutes?: number;
  dates: ReadDates;
  // Earlier finished reads: corrected dates, and reads added with the dialog.
  pastReads?: PastRead[];
  // When the reader got the book. Left out clears it, as with read dates.
  acquired?: PartialDate;
};

const sameList = (a: string[], b: string[]) => a.join(";") === b.join(";");

// Saves what belongs to this reader. `dates` apply to the latest read, and
// `pastReads` to earlier ones; no read is ever removed. Throws
// InvalidTransitionError for a status change that isn't allowed.
export function editUserBook(userId: string, userBookId: string, edit: BookEdit) {
  return transaction(async (tx) => {
    const current = await libraryModel.findUserBookWithCatalog(userId, userBookId, tx);
    if (!current) throw new NotFoundError(NOT_IN_LIBRARY);

    const owned = changeFormats(current, edit.formats);
    const status = edit.status ?? notStartedStatusFor(owned.formats);
    const change = readChangeFor(owned, status);
    const actedOn = await applyReadChanges(userId, [{ userBookId, change }], null, tx);
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
        audioMinutes: edit.audioMinutes ?? null,
        ...acquiredFields(edit.acquired),
      },
      tx,
    );

    await saveLatestReadDates(userId, userBookId, status, edit.dates, tx, actedOn.get(userBookId));
    if (status === ReadingStatus.FINISHED && edit.pastReads?.length) {
      await savePastReads(userId, userBookId, edit.pastReads, tx);
    }
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
