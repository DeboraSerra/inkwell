import type { z } from "zod";
import type { LengthCategory } from "@/generated/prisma/enums";
import type { enrichmentReplySchema } from "@/server/enrichment/enrichment.schema";

// A curated genre or trope the model may pick.
export type EnrichmentListItem = { id: string; name: string; description: string | null };

export type EnrichmentLists = { genres: EnrichmentListItem[]; tropes: EnrichmentListItem[] };

// What the model is told about a book, and what decides what's written.
export type EnrichmentBook = {
  id: string;
  ownerId: string | null;
  title: string;
  subtitle: string | null;
  authors: string[];
  description: string | null;
  pageCount: number | null;
  publishedYear: number | null;
  aiEnrichedAt: Date | null;
  aiAttempts: number;
};

export type EnrichmentReply = z.infer<typeof enrichmentReplySchema>;

// A validated reply, mapped to the curated lists' ids.
export type Enrichment = {
  genreIds: string[];
  tropeIds: string[];
  tags: string[];
  lengthCategory: LengthCategory | null;
};

export type EnrichmentParse = { ok: true; enrichment: Enrichment } | { ok: false; reason: string };

export type EnrichmentOutcome = "enriched" | "already-enriched" | "gave-up" | "failed";
