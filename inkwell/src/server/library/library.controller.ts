"use server";

// Server actions for the library. Everything exported here is a public
// endpoint, so each one authenticates and validates its own input.
import { revalidatePath } from "next/cache";
import type { BookFormat, ReadingStatus } from "@/generated/prisma/enums";
import { requireUser } from "@/server/auth/auth.guard";
import { DomainError } from "@/server/errors";
import * as libraryService from "./library.service";
import { type ManualBookValues, manualBookValues, parseManualBook } from "./manual-book.schema";
import {
  changeFormatsSchema,
  changeStatusSchema,
  moveBooksSchema,
  parseEditBook,
  parseMoveBook,
  removeBookSchema,
  removeBooksSchema,
} from "./shelf-actions.schema";
import { LIST_NAMES } from "./status.rules";

const SHELVES_PATH = "/books/shelves";
const INVALID_REQUEST = "That request isn't valid.";

export type AddManualBookState = {
  message?: string;
  error?: string;
  // What was typed, so a rejected form keeps it.
  values?: ManualBookValues;
};

export async function addManualBook(
  _prev: AddManualBookState,
  formData: FormData,
): Promise<AddManualBookState> {
  const user = await requireUser();
  const values = manualBookValues(formData);

  const parsed = parseManualBook(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

  const { formats, status, dates, ...details } = parsed.data;
  try {
    const { book, userBook, created } = await libraryService.addManualBook(
      user.id,
      details,
      formats,
      status,
      dates,
    );
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

export type BookChangeResult = {
  error?: string;
  book?: { id: string; status: ReadingStatus; formats: BookFormat[] };
};

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
