import { BookFormat } from "@/generated/prisma/enums";

export const FORMAT_LABELS: Record<BookFormat, string> = {
  [BookFormat.EBOOK]: "Ebook",
  [BookFormat.PHYSICAL]: "Physical",
  [BookFormat.AUDIO]: "Audiobook",
};
