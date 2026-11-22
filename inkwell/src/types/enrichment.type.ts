import type { LengthCategory } from "@/generated/prisma/enums";

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

// A validated reply, mapped to the curated lists' ids.
export type Enrichment = {
  genreIds: string[];
  tropeIds: string[];
  tags: string[];
  lengthCategory: LengthCategory | null;
};

export type EnrichmentParse = { ok: true; enrichment: Enrichment } | { ok: false; reason: string };

export type EnrichmentOutcome = "enriched" | "already-enriched" | "gave-up" | "failed";

export type BatchCollection = { batches: number; enriched: number; failed: number; skipped: number };

export type EnrichmentCronSummary = {
  collected: BatchCollection;
  submitted: { batchId: string; books: number } | null;
};
