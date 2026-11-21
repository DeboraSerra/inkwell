import "server-only";
import { createMessage, isAnthropicApiError, isAnthropicConfigError } from "@/config/anthropic";
import { transaction } from "@/server/db";
import { NotFoundError, ValidationError } from "@/server/errors";
import * as enrichmentModel from "./enrichment.model";
import { MAX_ATTEMPTS, enrichmentRequest, parseEnrichmentReply } from "./enrichment.rules";
import type { EnrichmentOutcome, EnrichmentParse } from "@/types/enrichment.type";

// Suggests genres, tropes, tags and a length for one shared catalog book,
// once. Private books are never sent to Anthropic. A failed call or an
// invalid reply counts as an attempt; after MAX_ATTEMPTS the book is left.
export async function enrichBook(bookId: string): Promise<EnrichmentOutcome> {
  const book = await enrichmentModel.findBookForEnrichment(bookId);
  if (!book) throw new NotFoundError("Book not found");
  if (book.ownerId) throw new ValidationError("Private books are never enriched.");
  if (book.aiEnrichedAt) return "already-enriched";
  if (book.aiAttempts >= MAX_ATTEMPTS) return "gave-up";

  const lists = await enrichmentModel.findEnrichmentLists();
  let parsed: EnrichmentParse;
  try {
    parsed = parseEnrichmentReply(await createMessage(enrichmentRequest(book, lists)), book, lists);
  } catch (error) {
    if (!isAnthropicApiError(error) || isAnthropicConfigError(error)) throw error;
    console.warn(`Enriching book ${bookId} failed`, error);
    await enrichmentModel.recordFailedAttempt(bookId);
    return "failed";
  }

  if (!parsed.ok) {
    console.warn(`Enriching book ${bookId} failed: ${parsed.reason}`);
    await enrichmentModel.recordFailedAttempt(bookId);
    return "failed";
  }

  const saved = await transaction((tx) => enrichmentModel.saveEnrichment(bookId, parsed.enrichment, tx));
  return saved ? "enriched" : "already-enriched";
}
