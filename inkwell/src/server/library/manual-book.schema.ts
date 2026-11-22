// Validates the add-book form. Kept out of the controller because everything
// exported from a "use server" file becomes a public endpoint.
import { z } from "zod";
import { BookFormat, ReadingStatus } from "@/generated/prisma/enums";
import { toIsbn13 } from "@/server/books/isbn";
import { parseAudioLength } from "./audio-length.rules";
import { isAfter, parsePartialDate } from "./partial-date.rules";
import type { PartialDate, ReadDates } from "@/types/dates.type";
import type { ManualBookValues, PastReadInput, ReadDateText } from "@/types/library.type";

const MAX_AUTHORS = 25;

export const isHttpsUrl = (value: string) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

// An empty form field arrives as "", which means "not provided".
export const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

export const authorsField = (split: (value: string) => string[]) =>
  z
    .string()
    .max(4000, "That's too much author text.")
    .transform((value) => split(value).map((name) => name.trim()).filter(Boolean))
    .refine((names) => names.length > 0, "Enter at least one author.")
    .refine((names) => names.length <= MAX_AUTHORS, `Enter at most ${MAX_AUTHORS} authors.`)
    .refine((names) => names.every((name) => name.length <= 200), "An author name is too long.");

export const pageCountField = optional(
  z.coerce.number("Enter the page count as a number.").int("Enter the page count as a whole number.").min(1, "Enter a page count of at least 1.").max(100_000, "That page count is too high."),
);

export const readStatusField = optional(
  z.enum([ReadingStatus.READING, ReadingStatus.FINISHED, ReadingStatus.DNF], "Choose a valid status."),
);

export const readDateFields = {
  startedDay: z.string().optional(),
  startedMonth: z.string().optional(),
  startedYear: z.string().optional(),
  endedDay: z.string().optional(),
  endedMonth: z.string().optional(),
  endedYear: z.string().optional(),
};

// Only these statuses have dates, so fields left over from another choice are ignored.
export function parseReadDates(status: ReadingStatus | undefined, text: ReadDateText): { dates?: ReadDates; error?: string } {
  const hasStart = status === ReadingStatus.READING || status === ReadingStatus.FINISHED;
  const hasEnd = status === ReadingStatus.FINISHED;
  const started = hasStart
    ? parsePartialDate("Start date", { day: text.startedDay, month: text.startedMonth, year: text.startedYear })
    : {};
  if (started.error) return { error: started.error };
  const ended = hasEnd
    ? parsePartialDate("Finish date", { day: text.endedDay, month: text.endedMonth, year: text.endedYear })
    : {};
  if (ended.error) return { error: ended.error };
  if (started.value && ended.value && isAfter(started.value, ended.value)) {
    return { error: "The start date can't be after the finish date." };
  }
  return { dates: { started: started.value, ended: ended.value } };
}

// When the reader got the book, typed like a read date: a year alone is fine.
export const acquiredFields = {
  acquiredDay: z.string().max(10).optional(),
  acquiredMonth: z.string().max(10).optional(),
  acquiredYear: z.string().max(10).optional(),
};

// Only an owned book was acquired: with no format ticked the field is hidden,
// so anything left in it is ignored, and an edit then clears the stored date.
export function parseAcquired(
  formats: readonly BookFormat[],
  text: { acquiredDay?: string; acquiredMonth?: string; acquiredYear?: string },
): {
  acquired?: PartialDate;
  error?: string;
} {
  if (!formats.length) return {};
  const { value, error } = parsePartialDate("Acquired date", {
    day: text.acquiredDay,
    month: text.acquiredMonth,
    year: text.acquiredYear,
  });
  return error ? { error } : { acquired: value };
}

export const audioLengthFields = {
  audioHours: z.string().max(10).optional(),
  audioMinutes: z.string().max(10).optional(),
};

// The length only applies to a book owned as an audiobook; the field is hidden
// otherwise, so anything left in it is ignored.
export function audioLengthFor(
  formats: readonly BookFormat[],
  text: { audioHours?: string; audioMinutes?: string },
): { minutes?: number; error?: string } {
  if (!formats.includes(BookFormat.AUDIO)) return {};
  return parseAudioLength(text.audioHours, text.audioMinutes);
}

// More finished reads of a book, from the date sets the form adds with its +
// button: pastRead1StartedYear, pastRead1EndedMonth, pastRead1Id and so on.
const MAX_PAST_READS = 20;
const PAST_READ_PARTS = ["StartedDay", "StartedMonth", "StartedYear", "EndedDay", "EndedMonth", "EndedYear", "Id"];

export const pastReadsField = z.record(z.string().max(40), z.string().max(64)).optional();

// The past-read fields a form sent, so a rejected form can keep them.
export function pastReadValues(formData: FormData) {
  const values: Record<string, string> = {};
  for (let index = 1; index <= MAX_PAST_READS; index++) {
    for (const part of PAST_READ_PARTS) {
      const name = `pastRead${index}${part}`;
      const value = formData.get(name);
      if (typeof value === "string" && value) values[name] = value;
    }
  }
  return values;
}

// Only a finished book has past reads. A new set left empty is skipped, so
// pressing + by mistake adds nothing; an existing read keeps its place even
// when its dates are cleared.
export function parsePastReads(
  status: ReadingStatus | undefined,
  text: Record<string, string> = {},
): { pastReads?: PastReadInput[]; error?: string } {
  if (status !== ReadingStatus.FINISHED) return { pastReads: [] };
  const pastReads: PastReadInput[] = [];
  for (let index = 1; index <= MAX_PAST_READS; index++) {
    const field = (part: string) => text[`pastRead${index}${part}`];
    const id = field("Id");
    const dateText = {
      startedDay: field("StartedDay"),
      startedMonth: field("StartedMonth"),
      startedYear: field("StartedYear"),
      endedDay: field("EndedDay"),
      endedMonth: field("EndedMonth"),
      endedYear: field("EndedYear"),
    };
    if (!id && Object.values(dateText).every((value) => !value)) continue;
    const { dates, error } = parseReadDates(ReadingStatus.FINISHED, dateText);
    if (!dates) return { error: error ?? "Those dates aren't valid." };
    pastReads.push({ ...(id && { id }), dates });
  }
  return { pastReads };
}

// Separated by semicolons, because a name can contain a comma ("Tolkien, J. R. R.").
export const typedAuthorsField = authorsField((value) => value.split(";"));

export const coverUrlField = optional(
  z.string().trim().max(2000, "That cover URL is too long.").refine(isHttpsUrl, "The cover URL must start with https://."),
);

const manualBookSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(300, "That title is too long."),
  authors: typedAuthorsField,
  subtitle: optional(z.string().trim().max(300, "That subtitle is too long.")),
  coverUrl: coverUrlField,
  pageCount: pageCountField,
  isbn: optional(z.string().trim().refine((value) => toIsbn13(value) !== null, "That ISBN isn't valid.")),
  formats: z.array(z.enum(BookFormat, "Choose a valid format.")),
  // Not started is left out: formats decide between Wishlist and TBR.
  status: readStatusField,
  ...readDateFields,
  ...audioLengthFields,
  ...acquiredFields,
  pastReads: pastReadsField,
}).transform((data, ctx) => {
  const {
    startedDay,
    startedMonth,
    startedYear,
    endedDay,
    endedMonth,
    endedYear,
    audioHours,
    audioMinutes,
    acquiredDay,
    acquiredMonth,
    acquiredYear,
    pastReads: pastReadText,
    ...book
  } = data;
  const { dates, error } = parseReadDates(book.status, { startedDay, startedMonth, startedYear, endedDay, endedMonth, endedYear });
  if (!dates) {
    ctx.addIssue({ code: "custom", message: error ?? "Those dates aren't valid." });
    return z.NEVER;
  }
  const length = audioLengthFor(book.formats, { audioHours, audioMinutes });
  if (length.error) {
    ctx.addIssue({ code: "custom", message: length.error });
    return z.NEVER;
  }
  const past = parsePastReads(book.status, pastReadText);
  if (!past.pastReads) {
    ctx.addIssue({ code: "custom", message: past.error ?? "Those dates aren't valid." });
    return z.NEVER;
  }
  const { acquired, error: acquiredError } = parseAcquired(book.formats, { acquiredDay, acquiredMonth, acquiredYear });
  if (acquiredError) {
    ctx.addIssue({ code: "custom", message: acquiredError });
    return z.NEVER;
  }
  return { ...book, dates, audioMinutes: length.minutes, pastReads: past.pastReads, acquired };
});

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
  audioHours: text(formData, "audioHours"),
  audioMinutes: text(formData, "audioMinutes"),
  acquiredDay: text(formData, "acquiredDay"),
  acquiredMonth: text(formData, "acquiredMonth"),
  acquiredYear: text(formData, "acquiredYear"),
  pastReads: pastReadValues(formData),
});

export function parseManualBook(formData: FormData) {
  return manualBookSchema.safeParse({
    ...manualBookValues(formData),
    formats: formData.getAll("formats"),
  });
}
