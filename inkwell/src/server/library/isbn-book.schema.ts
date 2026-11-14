// Validates the add-by-ISBN form. Kept out of the controller because everything
// exported from a "use server" file becomes a public endpoint. Whether the ISBN
// is valid is checked by the metadata service, which also normalizes it.
import { z } from "zod";
import { BookFormat } from "@/generated/prisma/enums";
import {
  acquiredFields,
  audioLengthFields,
  audioLengthFor,
  manualBookValues,
  parseAcquired,
  parsePastReads,
  parseReadDates,
  pastReadsField,
  readDateFields,
  readStatusField,
} from "./manual-book.schema";

export const isbnField = z
  .string("Enter an ISBN.")
  .trim()
  .min(1, "Enter an ISBN.")
  .max(30, "That ISBN is too long.");

const isbnBookSchema = z
  .object({
    isbn: isbnField,
    formats: z.array(z.enum(BookFormat, "Choose a valid format.")),
    status: readStatusField,
    ...readDateFields,
    ...audioLengthFields,
    ...acquiredFields,
    pastReads: pastReadsField,
  })
  .transform((data, ctx) => {
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
  });

export function parseIsbnBook(formData: FormData) {
  return isbnBookSchema.safeParse({
    ...manualBookValues(formData),
    formats: formData.getAll("formats"),
  });
}
