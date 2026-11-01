// Validates the add-book form. Kept out of the controller because everything
// exported from a "use server" file becomes a public endpoint.
import { z } from "zod";
import { BookFormat, ReadingStatus } from "@/generated/prisma/enums";
import { toIsbn13 } from "@/server/books/isbn";
import { isAfter, parsePartialDate, type ReadDates } from "./partial-date.rules";

const MAX_AUTHORS = 25;

const isHttpsUrl = (value: string) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

// An empty form field arrives as "", which means "not provided".
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const manualBookSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(300, "That title is too long."),
  authors: z
    .string()
    .max(4000, "That's too much author text.")
    .transform((value) => value.split(";").map((name) => name.trim()).filter(Boolean))
    .refine((names) => names.length > 0, "Enter at least one author.")
    .refine((names) => names.length <= MAX_AUTHORS, `Enter at most ${MAX_AUTHORS} authors.`)
    .refine((names) => names.every((name) => name.length <= 200), "An author name is too long."),
  subtitle: optional(z.string().trim().max(300, "That subtitle is too long.")),
  coverUrl: optional(
    z.string().trim().max(2000, "That cover URL is too long.").refine(isHttpsUrl, "The cover URL must start with https://."),
  ),
  pageCount: optional(
    z.coerce.number("Enter the page count as a number.").int("Enter the page count as a whole number.").min(1, "Enter a page count of at least 1.").max(100_000, "That page count is too high."),
  ),
  isbn: optional(z.string().trim().refine((value) => toIsbn13(value) !== null, "That ISBN isn't valid.")),
  formats: z.array(z.enum(BookFormat, "Choose a valid format.")),
  // Not started is left out: formats decide between Wishlist and TBR.
  status: optional(
    z.enum([ReadingStatus.READING, ReadingStatus.FINISHED, ReadingStatus.DNF], "Choose a valid status."),
  ),
  startedDay: z.string().optional(),
  startedMonth: z.string().optional(),
  startedYear: z.string().optional(),
  endedDay: z.string().optional(),
  endedMonth: z.string().optional(),
  endedYear: z.string().optional(),
}).transform((data, ctx) => {
  const { startedDay, startedMonth, startedYear, endedDay, endedMonth, endedYear, ...book } = data;
  const fail = (message: string) => {
    ctx.addIssue({ code: "custom", message });
    return z.NEVER;
  };

  // Only these statuses have dates, so fields left over from another choice are ignored.
  const hasStart = book.status === ReadingStatus.READING || book.status === ReadingStatus.FINISHED;
  const hasEnd = book.status === ReadingStatus.FINISHED;
  const started = hasStart
    ? parsePartialDate("Start date", { day: startedDay, month: startedMonth, year: startedYear })
    : {};
  if (started.error) return fail(started.error);
  const ended = hasEnd
    ? parsePartialDate("Finish date", { day: endedDay, month: endedMonth, year: endedYear })
    : {};
  if (ended.error) return fail(ended.error);
  if (started.value && ended.value && isAfter(started.value, ended.value)) {
    return fail("The start date can't be after the finish date.");
  }

  const dates: ReadDates = { started: started.value, ended: ended.value };
  return { ...book, dates };
});

export type ManualBookValues = {
  title?: string;
  authors?: string;
  subtitle?: string;
  coverUrl?: string;
  pageCount?: string;
  isbn?: string;
  formats?: string[];
  status?: string;
  startedDay?: string;
  startedMonth?: string;
  startedYear?: string;
  endedDay?: string;
  endedMonth?: string;
  endedYear?: string;
};

const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

// What was typed, returned on an error so the form can keep it.
export const manualBookValues = (formData: FormData): ManualBookValues => ({
  title: text(formData, "title"),
  authors: text(formData, "authors"),
  subtitle: text(formData, "subtitle"),
  coverUrl: text(formData, "coverUrl"),
  pageCount: text(formData, "pageCount"),
  isbn: text(formData, "isbn"),
  formats: formData.getAll("formats").filter((value) => typeof value === "string"),
  status: text(formData, "status"),
  startedDay: text(formData, "startedDay"),
  startedMonth: text(formData, "startedMonth"),
  startedYear: text(formData, "startedYear"),
  endedDay: text(formData, "endedDay"),
  endedMonth: text(formData, "endedMonth"),
  endedYear: text(formData, "endedYear"),
});

export function parseManualBook(formData: FormData) {
  return manualBookSchema.safeParse({
    ...manualBookValues(formData),
    formats: formData.getAll("formats"),
  });
}
