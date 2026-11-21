"use server";

// Server actions for the library. Everything exported here is a public
// endpoint, so each one authenticates and validates its own input.
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { after, userAgent } from "next/server";
import type { BookFormat, ReadingStatus } from "@/generated/prisma/enums";
import { requireUser } from "@/server/auth/auth.guard";
import { DomainError } from "@/server/errors";
import { consumeRateLimit } from "@/server/rate-limit/rate-limit.service";
import { isbnField, parseIsbnBook, parseSearchBook, searchResultSchema } from "./isbn-book.schema";
import * as libraryService from "./library.service";
import { manualBookValues, parseManualBook } from "./manual-book.schema";
import {
  changeFormatsSchema,
  changeStatusSchema,
  moveBooksSchema,
  parseEditBook,
  parseMoveBook,
  removeBookSchema,
  removeBooksSchema,
  shelfParamsSchema,
} from "./shelf-actions.schema";
import { PAGE_SIZE_COOKIE, parsePageSize, parseShelfFilters, resolvePageSize } from "./shelf-filters";
import { LIST_NAMES } from "./status.rules";
import type { AddIsbnBookState, AddManualBookState, BookChangeResult, IsbnLookupResult, LoadShelfResult, SearchPreviewResult } from "@/types/library.type";

const SHELVES_PATH = "/books/shelves";
const INVALID_REQUEST = "That request isn't valid.";

export async function addManualBook(
  _prev: AddManualBookState,
  formData: FormData,
): Promise<AddManualBookState> {
  const user = await requireUser();
  const values = manualBookValues(formData);

  const parsed = parseManualBook(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

  const { formats, status, dates, audioMinutes, pastReads, acquired, ...details } = parsed.data;
  try {
    const added = await libraryService.addManualBook(
      user.id,
      details,
      formats,
      status,
      dates,
      audioMinutes,
      pastReads,
      acquired,
    );
    const { book, userBook, created } = added;
    // After the response, so a slow provider or the AI never delays the add: a
    // typed ISBN or a matched catalog book's provider id can find a synopsis,
    // then the shared book is enriched.
    after(() => libraryService.finishAdd(user.id, added));
    revalidatePath(SHELVES_PATH);
    const list = LIST_NAMES[userBook.status];
    return {
      message: created
        ? `Added “${book.title}” to ${list}.`
        : `“${book.title}” is already in your library, on ${list}. Any new formats were added.`,
    };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message, values };
    throw error;
  }
}

export async function lookUpIsbn(isbn: unknown): Promise<IsbnLookupResult> {
  const user = await requireUser();
  const parsed = isbnField.safeParse(isbn);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await consumeRateLimit(user.id, "ISBN_LOOKUP");
    const result = await libraryService.previewIsbn(user.id, parsed.data);
    return result.found ? { preview: result.preview } : { notFound: { isbn13: result.isbn13 } };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}

export async function addBookByIsbn(
  _prev: AddIsbnBookState,
  formData: FormData,
): Promise<AddIsbnBookState> {
  const user = await requireUser();
  const values = manualBookValues(formData);

  const parsed = parseIsbnBook(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

  const { isbn, ...choices } = parsed.data;
  try {
    await consumeRateLimit(user.id, "ISBN_LOOKUP");
    const added = await libraryService.addBookByIsbn(user.id, isbn, choices);
    const { book, userBook, created } = added;
    // After the response, so a slow provider or the AI never delays or fails
    // the add: the synopsis, then the shared book's enrichment.
    after(() => libraryService.finishAdd(user.id, added));
    revalidatePath(SHELVES_PATH);
    const list = LIST_NAMES[userBook.status];
    return {
      message: created
        ? `Added “${book.title}” to ${list}.`
        : `“${book.title}” is already in your library, on ${list}. Any new formats were added.`,
    };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message, values };
    throw error;
  }
}

// Opens a search result for adding. Counts as a lookup, since it may call a
// provider again.
export async function previewSearchResult(result: unknown): Promise<SearchPreviewResult> {
  const user = await requireUser();
  const parsed = searchResultSchema.safeParse(result);
  if (!parsed.success) return { error: "Choose a search result." };
  try {
    await consumeRateLimit(user.id, "ISBN_LOOKUP");
    return { preview: await libraryService.previewSearchResult(user.id, parsed.data) };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}

// Adds a search result by the record the reader picked, recorded as found by
// search.
export async function addSearchBook(
  _prev: AddIsbnBookState,
  formData: FormData,
): Promise<AddIsbnBookState> {
  const user = await requireUser();
  const values = manualBookValues(formData);

  const parsed = parseSearchBook(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

  const { source, sourceId, ...choices } = parsed.data;
  try {
    await consumeRateLimit(user.id, "ISBN_LOOKUP");
    const added = await libraryService.addBookFromProvider(user.id, { source, sourceId }, choices);
    const { book, userBook, created } = added;
    // After the response, so a slow provider or the AI never delays or fails
    // the add: the synopsis, then the shared book's enrichment.
    after(() => libraryService.finishAdd(user.id, added));
    revalidatePath(SHELVES_PATH);
    const list = LIST_NAMES[userBook.status];
    return {
      message: created
        ? `Added “${book.title}” to ${list}.`
        : `“${book.title}” is already in your library, on ${list}. Any new formats were added.`,
    };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message, values };
    throw error;
  }
}

export async function changeBookStatus(userBookId: string, status: ReadingStatus): Promise<BookChangeResult> {
  const user = await requireUser();
  const parsed = changeStatusSchema.safeParse({ userBookId, status });
  if (!parsed.success) return { error: INVALID_REQUEST };
  try {
    const book = await libraryService.updateStatus(user.id, parsed.data.userBookId, parsed.data.status);
    revalidatePath(SHELVES_PATH);
    return { book: { id: book.id, status: book.status, formats: book.formats } };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}

export async function changeBookFormats(userBookId: string, formats: BookFormat[]): Promise<BookChangeResult> {
  const user = await requireUser();
  const parsed = changeFormatsSchema.safeParse({ userBookId, formats });
  if (!parsed.success) return { error: INVALID_REQUEST };
  try {
    const book = await libraryService.updateFormats(user.id, parsed.data.userBookId, parsed.data.formats);
    revalidatePath(SHELVES_PATH);
    return { book: { id: book.id, status: book.status, formats: book.formats } };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}

// One page of a shelf, for the app-wide books context. The filters are parsed
// again here, since the query string comes from the client. The page size is
// the URL's, then the reader's remembered choice, then 10 on phones and 30
// elsewhere, decided here so a first visit on a phone never loads 30.
export async function loadShelf(params: unknown): Promise<LoadShelfResult> {
  const user = await requireUser();
  const parsed = shelfParamsSchema.safeParse(params);
  if (!parsed.success) return { error: INVALID_REQUEST };
  const { status, owned, formats, search, page, perPage, sort } = parseShelfFilters(parsed.data);
  const pageSize = resolvePageSize({
    url: perPage,
    cookie: (await cookies()).get(PAGE_SIZE_COOKIE)?.value,
    isPhone: userAgent({ headers: await headers() }).device.type === "mobile",
  });
  const shelf = await libraryService.listShelfPage(user.id, { status, owned, formats, search, sort }, page, pageSize);
  return { shelf };
}

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// Remembers the reader's books-per-page choice for every shelf and later
// visits. It's a display preference, not personal data, and only the server
// reads it.
export async function rememberShelfPageSize(size: unknown): Promise<{ error?: string }> {
  await requireUser();
  const pageSize = parsePageSize(size);
  if (!pageSize) return { error: INVALID_REQUEST };
  (await cookies()).set(PAGE_SIZE_COOKIE, String(pageSize), {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  return {};
}

export async function moveBooks(
  userBookIds: string[],
  status: ReadingStatus,
): Promise<{ error?: string; moved?: string[]; skipped?: number }> {
  const user = await requireUser();
  const parsed = moveBooksSchema.safeParse({ userBookIds, status });
  if (!parsed.success) return { error: INVALID_REQUEST };
  try {
    const { moved, skipped } = await libraryService.updateStatuses(
      user.id,
      parsed.data.userBookIds,
      parsed.data.status,
    );
    revalidatePath(SHELVES_PATH);
    return { moved, skipped: skipped.length };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}

export async function editBook(userBookId: string, formData: FormData): Promise<BookChangeResult> {
  const user = await requireUser();
  const parsed = parseEditBook(userBookId, formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { userBookId: id, ...edit } = parsed.data;
  try {
    const book = await libraryService.editUserBook(user.id, id, edit);
    revalidatePath(SHELVES_PATH);
    return { book: { id: book.id, status: book.status, formats: book.formats } };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}

export async function moveBookWithDates(
  userBookId: string,
  status: ReadingStatus,
  formData: FormData,
): Promise<BookChangeResult> {
  const user = await requireUser();
  const parsed = parseMoveBook(userBookId, status, formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    const book = await libraryService.moveUserBook(
      user.id,
      parsed.data.userBookId,
      parsed.data.status,
      parsed.data.dates,
    );
    revalidatePath(SHELVES_PATH);
    return { book: { id: book.id, status: book.status, formats: book.formats } };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}

export async function removeBook(userBookId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const parsed = removeBookSchema.safeParse({ userBookId });
  if (!parsed.success) return { error: INVALID_REQUEST };
  try {
    await libraryService.removeUserBook(user.id, parsed.data.userBookId);
    revalidatePath(SHELVES_PATH);
    return {};
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}

export async function removeBooks(userBookIds: string[]): Promise<{ error?: string; removed?: number }> {
  const user = await requireUser();
  const parsed = removeBooksSchema.safeParse({ userBookIds });
  if (!parsed.success) return { error: INVALID_REQUEST };
  try {
    const removed = await libraryService.removeUserBooks(user.id, parsed.data.userBookIds);
    revalidatePath(SHELVES_PATH);
    return { removed };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}
