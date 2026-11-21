import "server-only";
import { batchResults, createBatch, createMessage, isAnthropicApiError, isAnthropicConfigError, retrieveBatch } from "@/config/anthropic";
import { fillMissingDescription } from "@/server/books/book.service";
import { transaction } from "@/server/db";
import { NotFoundError, ValidationError } from "@/server/errors";
import * as enrichmentModel from "./enrichment.model";
import {
  MAX_ATTEMPTS,
  MAX_BATCH_SIZE,
  SYNOPSIS_LOOKUPS_PER_RUN,
  enrichmentRequest,
  parseEnrichmentReply,
} from "./enrichment.rules";
import type { MessageBatchIndividualResponse } from "@anthropic-ai/sdk/resources/messages";
import type {
  BatchCollection,
  EnrichmentCronSummary,
  EnrichmentLists,
  EnrichmentOutcome,
  EnrichmentParse,
} from "@/types/enrichment.type";

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

  return saveParsed(bookId, parsed);
}

async function saveParsed(bookId: string, parsed: EnrichmentParse): Promise<EnrichmentOutcome> {
  if (!parsed.ok) {
    console.warn(`Enriching book ${bookId} failed: ${parsed.reason}`);
    await enrichmentModel.recordFailedAttempt(bookId);
    return "failed";
  }
  const saved = await transaction((tx) => enrichmentModel.saveEnrichment(bookId, parsed.enrichment, tx));
  return saved ? "enriched" : "already-enriched";
}

const LOOKUPS_AT_ONCE = 4;

// The synopsis lookup (5b1) for books that haven't had one, a few at a time
// and capped per run, so enrichment can use what it finds. A book left over
// waits for the next run and isn't batched until then.
async function lookUpSynopses(bookIds?: string[]) {
  const books = await enrichmentModel.findBooksNeedingSynopsis(MAX_ATTEMPTS, SYNOPSIS_LOOKUPS_PER_RUN, bookIds);
  for (let start = 0; start < books.length; start += LOOKUPS_AT_ONCE) {
    await Promise.all(books.slice(start, start + LOOKUPS_AT_ONCE).map((book) => fillMissingDescription(book)));
  }
}

// Sends the backlog, or just the given books, as one Message Batch: shared
// books with no enrichment, fewer than MAX_ATTEMPTS attempts, and not in a
// batch still pending. Null when there's nothing to send.
export async function submitEnrichmentBatch(bookIds?: string[]) {
  if (bookIds?.length === 0) return null;
  await lookUpSynopses(bookIds);
  const pending = await enrichmentModel.findPendingBookIds();
  const books = await enrichmentModel.findBooksToEnrich(MAX_ATTEMPTS, MAX_BATCH_SIZE, pending, bookIds);
  if (books.length === 0) return null;

  const lists = await enrichmentModel.findEnrichmentLists();
  const batch = await createBatch(
    books.map((book) => ({ custom_id: book.id, params: enrichmentRequest(book, lists, { cache: true }) })),
  );
  const ids = books.map((book) => book.id);
  await enrichmentModel.createEnrichmentBatch(batch.id, ids);
  return { batchId: batch.id, books: ids.length };
}

// For the import route's after(): an import never fails because of this.
export async function enrichImportedBooks(bookIds: string[]) {
  try {
    await submitEnrichmentBatch(bookIds);
  } catch (error) {
    console.warn("Submitting an import's books for enrichment failed; the cron will pick them up", error);
  }
}

// A request that errored counts as an attempt. One that expired or was
// canceled doesn't: it wasn't the book's fault, and the next run sends it again.
async function collectResult(
  result: MessageBatchIndividualResponse,
  lists: EnrichmentLists,
  counts: BatchCollection,
) {
  const bookId = result.custom_id;
  if (result.result.type === "succeeded") {
    const book = await enrichmentModel.findBookForEnrichment(bookId);
    if (!book || book.ownerId) return;
    const outcome = await saveParsed(bookId, parseEnrichmentReply(result.result.message, book, lists));
    counts[outcome === "failed" ? "failed" : "enriched"]++;
  } else if (result.result.type === "errored") {
    console.warn(`Enriching book ${bookId} in a batch failed`, result.result.error);
    await enrichmentModel.recordFailedAttempt(bookId);
    counts.failed++;
  } else {
    counts.skipped++;
  }
}

// Writes the results of every batch that has ended. Results are matched by
// custom_id, and only for the books that batch was sent with.
export async function collectEnrichmentBatches() {
  const counts: BatchCollection = { batches: 0, enriched: 0, failed: 0, skipped: 0 };
  let lists: EnrichmentLists | undefined;
  for (const batch of await enrichmentModel.findSubmittedBatches()) {
    const status = await retrieveBatch(batch.anthropicBatchId);
    if (status.processing_status !== "ended") continue;
    lists ??= await enrichmentModel.findEnrichmentLists();
    const sent = new Set(batch.bookIds);
    for await (const result of await batchResults(batch.anthropicBatchId)) {
      if (sent.has(result.custom_id)) await collectResult(result, lists, counts);
    }
    await enrichmentModel.markBatchCollected(batch.id);
    counts.batches++;
  }
  return counts;
}

// The daily cron: collect what's ended, then send what's left.
export async function runEnrichmentCron(): Promise<EnrichmentCronSummary> {
  const collected = await collectEnrichmentBatches();
  const submitted = await submitEnrichmentBatch();
  return { collected, submitted };
}
