import "server-only";
import type { Ownership, ReadingStatus, UserBookSource } from "@/generated/prisma/enums";
import { normalizeTitle } from "@/server/books/dedupe";
import { transaction } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import * as libraryModel from "./library.model";
import {
  changeOwnership,
  initialState,
  transitionStatus,
  type ReadingState,
} from "./status.rules";

// Every function takes the signed-in user's id first.

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

export type AddBookInput = {
  bookId: string;
  ownership: Ownership;
  source: UserBookSource;
  status?: ReadingStatus;
  // When the status was reached, for books read or started in the past.
  at?: Date;
};

// Idempotent: if the book is already in the library, the existing row is
// returned unchanged (re-imports never overwrite the user's data). Throws
// InvalidTransitionError for a status that doesn't fit the ownership.
export async function addBookToLibrary(userId: string, input: AddBookInput) {
  const existing = await libraryModel.findUserBookByBookId(userId, input.bookId);
  if (existing) return { userBook: existing, created: false };

  const state = initialState(input.ownership, input.status, input.at);
  const created = await libraryModel.createUserBook({
    userId,
    bookId: input.bookId,
    source: input.source,
    ...state,
  });
  if (created) return { userBook: created, created: true };

  // Another request added the same book at the same moment.
  const userBook = await libraryModel.findUserBookByBookId(userId, input.bookId);
  if (!userBook) throw new NotFoundError("Book not found in your library");
  return { userBook, created: false };
}

export function getUserBook(userId: string, userBookId: string) {
  return libraryModel.findUserBookWithCatalog(userId, userBookId);
}

export type UserBookFilters = {
  status?: ReadingStatus | ReadingStatus[];
  ownership?: Ownership | Ownership[];
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
    ownership: toArray(filters.ownership),
    source: filters.source,
    search: text ? { text, normalized: normalizeTitle(text) } : undefined,
    take: Math.min(Math.max(filters.take ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE),
    cursor: filters.cursor,
  });
}

// Reads and writes in one transaction, so concurrent changes can't interleave.
function updateState(
  userId: string,
  userBookId: string,
  next: (current: ReadingState) => ReadingState,
) {
  return transaction(async (tx) => {
    const current = await libraryModel.findUserBook(userId, userBookId, tx);
    if (!current) throw new NotFoundError("Book not found in your library");
    return libraryModel.updateUserBookState(userId, userBookId, next(current), tx);
  });
}

// Throws InvalidTransitionError for a change that isn't allowed.
export function updateStatus(
  userId: string,
  userBookId: string,
  status: ReadingStatus,
  at?: Date,
) {
  return updateState(userId, userBookId, (current) => transitionStatus(current, status, at));
}

export function updateOwnership(userId: string, userBookId: string, ownership: Ownership) {
  return updateState(userId, userBookId, (current) => changeOwnership(current, ownership));
}
