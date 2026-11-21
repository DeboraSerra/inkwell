import { z } from "zod";
import { LengthCategory } from "@/generated/prisma/enums";

// The model's reply. Structured output already constrains it, but it's
// checked again before anything is written: the reply is untrusted.
export const enrichmentReplySchema = z.object({
  genres: z.array(z.string()).max(50),
  tropes: z.array(z.string()).max(50),
  tags: z.array(z.string()).min(1).max(50),
  lengthCategory: z.enum(LengthCategory).optional(),
});
