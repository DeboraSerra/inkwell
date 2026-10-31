"use server";

// Server actions for the library. Everything exported here is a public
// endpoint, so each one authenticates and validates its own input.
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/auth.guard";
import { DomainError } from "@/server/errors";
import * as libraryService from "./library.service";
import { type ManualBookValues, manualBookValues, parseManualBook } from "./manual-book.schema";
import { LIST_NAMES } from "./status.rules";

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

  const { formats, ...details } = parsed.data;
  try {
    const { book, userBook, created } = await libraryService.addManualBook(user.id, details, formats);
    revalidatePath("/");
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
