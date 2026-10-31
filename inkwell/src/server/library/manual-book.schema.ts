// Validates the add-book form. Kept out of the controller because everything
// exported from a "use server" file becomes a public endpoint.
import { z } from "zod";
import { BookFormat } from "@/generated/prisma/enums";
import { toIsbn13 } from "@/server/books/isbn";

const MAX_AUTHORS = 20;

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
});

export type ManualBookValues = {
  title?: string;
  authors?: string;
  subtitle?: string;
  coverUrl?: string;
  pageCount?: string;
  isbn?: string;
  formats?: string[];
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
});

export function parseManualBook(formData: FormData) {
  return manualBookSchema.safeParse({
    ...manualBookValues(formData),
    formats: formData.getAll("formats"),
  });
}
