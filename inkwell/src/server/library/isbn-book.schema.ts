// Validates the add-by-ISBN form. Kept out of the controller because everything
// exported from a "use server" file becomes a public endpoint. Whether the ISBN
// is valid is checked by the metadata service, which also normalizes it.
import { z } from "zod";
import { BookFormat } from "@/generated/prisma/enums";
import { manualBookValues, parseReadDates, readDateFields, readStatusField } from "./manual-book.schema";

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
  })
  .transform((data, ctx) => {
    const { startedDay, startedMonth, startedYear, endedDay, endedMonth, endedYear, ...choices } = data;
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
    return { ...choices, dates };
  });

export function parseIsbnBook(formData: FormData) {
  return isbnBookSchema.safeParse({
    ...manualBookValues(formData),
    formats: formData.getAll("formats"),
  });
}
