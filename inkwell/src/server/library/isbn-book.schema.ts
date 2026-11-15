// Validates the add-by-ISBN form. Kept out of the controller because everything
// exported from a "use server" file becomes a public endpoint. Whether the ISBN
// is valid is checked by the metadata service, which also normalizes it.
import { z } from "zod";
import { BookFormat } from "@/generated/prisma/enums";
import {
  acquiredFields,
  audioLengthFields,
  audioLengthFor,
  coverUrlField,
  manualBookValues,
  optional,
  pageCountField,
  parseAcquired,
  parsePastReads,
  parseReadDates,
  pastReadsField,
  readDateFields,
  readStatusField,
  typedAuthorsField,
} from "./manual-book.schema";

export const isbnField = z
  .string("Enter an ISBN.")
  .trim()
  .min(1, "Enter an ISBN.")
  .max(30, "That ISBN is too long.");

// The reader's choices when adding a looked-up book: formats, list, dates,
// length and purchase date. Shared by the ISBN and search forms.
const choiceFields = {
  formats: z.array(z.enum(BookFormat, "Choose a valid format.")),
  status: readStatusField,
  ...readDateFields,
  ...audioLengthFields,
  ...acquiredFields,
  pastReads: pastReadsField,
  // The reader's own details, as the edit dialog takes them; empty means the
  // catalog's. The book itself still comes from the server's lookup.
  authors: optional(typedAuthorsField),
  pageCount: pageCountField,
  coverUrl: coverUrlField,
};
type ChoiceInput = z.infer<z.ZodObject<typeof choiceFields>>;

function toChoices<T extends ChoiceInput>(data: T, ctx: z.RefinementCtx) {
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
    ...choices
  } = data;
  const { dates, error } = parseReadDates(choices.status, {
    startedDay,
    startedMonth,
    startedYear,
    endedDay,
    endedMonth,
    endedYear,
  });
  if (!dates) {
    ctx.addIssue({ code: "custom", message: error ?? "Those dates aren't valid." });
    return z.NEVER;
  }
  const length = audioLengthFor(choices.formats, { audioHours, audioMinutes });
  if (length.error) {
    ctx.addIssue({ code: "custom", message: length.error });
    return z.NEVER;
  }
  const past = parsePastReads(choices.status, pastReadText);
  if (!past.pastReads) {
    ctx.addIssue({ code: "custom", message: past.error ?? "Those dates aren't valid." });
    return z.NEVER;
  }
  const { acquired, error: acquiredError } = parseAcquired(choices.formats, { acquiredDay, acquiredMonth, acquiredYear });
  if (acquiredError) {
    ctx.addIssue({ code: "custom", message: acquiredError });
    return z.NEVER;
  }
  return { ...choices, dates, audioMinutes: length.minutes, pastReads: past.pastReads, acquired };
}

const isbnBookSchema = z.object({ isbn: isbnField, ...choiceFields }).transform(toChoices);

// A provider and its record id, as a search result carries them. The id is
// only a lookup key, checked again by the provider.
export const providerRefFields = {
  source: z.enum(["OPEN_LIBRARY", "GOOGLE_BOOKS"], "Choose a search result."),
  sourceId: z.string("Choose a search result.").regex(/^[\w-]{1,64}$/, "Choose a search result."),
};

export const searchResultSchema = z.object(providerRefFields);

// A search result is added by the provider record the reader picked.
const searchBookSchema = z.object({ ...providerRefFields, ...choiceFields }).transform(toChoices);

export function parseSearchBook(formData: FormData) {
  return searchBookSchema.safeParse({
    ...manualBookValues(formData),
    formats: formData.getAll("formats"),
    source: formData.get("source"),
    sourceId: formData.get("sourceId"),
  });
}

export function parseIsbnBook(formData: FormData) {
  return isbnBookSchema.safeParse({
    ...manualBookValues(formData),
    formats: formData.getAll("formats"),
  });
}
