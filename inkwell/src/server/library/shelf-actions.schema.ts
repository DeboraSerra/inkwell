// Validates what the shelf page sends. Kept out of the controller because
// everything exported from a "use server" file becomes a public endpoint.
import { z } from "zod";
import { BookFormat, ReadingStatus } from "@/generated/prisma/enums";
import {
  coverUrlField,
  optional,
  pageCountField,
  parseReadDates,
  readDateFields,
  readStatusField,
  typedAuthorsField,
} from "./manual-book.schema";

const id = z.string().min(1).max(64);
const status = z.enum(ReadingStatus);

export const changeStatusSchema = z.object({ userBookId: id, status });
// The service enforces the real limit; this only stops an oversized request.
export const moveBooksSchema = z.object({ userBookIds: z.array(id).min(1).max(200), status });
export const changeFormatsSchema = z.object({ userBookId: id, formats: z.array(z.enum(BookFormat)).max(3) });
export const removeBookSchema = z.object({ userBookId: id });
// The service enforces the real limit; this only stops an oversized request.
export const removeBooksSchema = z.object({ userBookIds: z.array(id).min(1).max(200) });

// A status left out means not started: formats decide between Wishlist and TBR.
const editBookSchema = z
  .object({
    userBookId: id,
    formats: z.array(z.enum(BookFormat, "Choose a valid format.")).max(3),
    status: readStatusField,
    pageCount: pageCountField,
    authors: optional(typedAuthorsField),
    coverUrl: coverUrlField,
    ...readDateFields,
  })
  .transform((data, ctx) => {
    const { dates, error } = parseReadDates(data.status, data);
    if (!dates) {
      ctx.addIssue({ code: "custom", message: error ?? "Those dates aren't valid." });
      return z.NEVER;
    }
    const { userBookId, formats, status, pageCount, authors, coverUrl } = data;
    return { userBookId, formats, status, pageCount, authors, coverUrl, dates };
  });

export function parseEditBook(userBookId: string, formData: FormData) {
  const fields = Object.fromEntries(
    [...formData.entries()].filter(([name]) => name !== "formats" && name !== "userBookId"),
  );
  return editBookSchema.safeParse({ ...fields, userBookId, formats: formData.getAll("formats") });
}

const moveBookSchema = z
  .object({
    userBookId: id,
    status: z.enum([ReadingStatus.READING, ReadingStatus.FINISHED]),
    ...readDateFields,
  })
  .transform((data, ctx) => {
    const { dates, error } = parseReadDates(data.status, data);
    if (!dates) {
      ctx.addIssue({ code: "custom", message: error ?? "Those dates aren't valid." });
      return z.NEVER;
    }
    return { userBookId: data.userBookId, status: data.status, dates };
  });

export function parseMoveBook(userBookId: string, status: ReadingStatus, formData: FormData) {
  return moveBookSchema.safeParse({ ...Object.fromEntries(formData.entries()), userBookId, status });
}
