import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { EnrichmentBatchStatus, TagSource } from "@/generated/prisma/enums";
import { prisma } from "@/server/db";
import type { Enrichment } from "@/types/enrichment.type";
import type { Db } from "@/types/server.type";

const ENRICHMENT_FIELDS = {
  id: true,
  ownerId: true,
  title: true,
  subtitle: true,
  authors: true,
  description: true,
  pageCount: true,
  publishedYear: true,
  aiEnrichedAt: true,
  aiAttempts: true,
} as const;

export function findBookForEnrichment(bookId: string, db: Db = prisma) {
  return db.book.findUnique({ where: { id: bookId }, select: ENRICHMENT_FIELDS });
}

// Shared, not enriched yet, and not given up on.
const backlog = (maxAttempts: number, bookIds?: string[]): Prisma.BookWhereInput => ({
  ownerId: null,
  aiEnrichedAt: null,
  aiAttempts: { lt: maxAttempts },
  ...(bookIds ? { id: { in: bookIds } } : {}),
});

// No synopsis, never looked for, and something to look it up by. Such a book
// gets its lookup before it's batched (see 5b1).
const NEEDS_SYNOPSIS: Prisma.BookWhereInput = {
  AND: [
    { OR: [{ description: null }, { description: "" }] },
    { descriptionCheckedAt: null },
    { OR: [{ isbn13: { not: null } }, { openLibraryId: { not: null } }, { googleBooksId: { not: null } }] },
  ],
};

export function findBooksNeedingSynopsis(maxAttempts: number, limit: number, bookIds?: string[], db: Db = prisma) {
  return db.book.findMany({
    where: { ...backlog(maxAttempts, bookIds), ...NEEDS_SYNOPSIS },
    select: {
      id: true,
      ownerId: true,
      isbn13: true,
      isbn10: true,
      openLibraryId: true,
      googleBooksId: true,
      description: true,
      descriptionCheckedAt: true,
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

// Oldest first, leaving out books in a batch still pending and books still
// waiting for their synopsis lookup.
export function findBooksToEnrich(
  maxAttempts: number,
  limit: number,
  pendingIds: string[],
  bookIds?: string[],
  db: Db = prisma,
) {
  return db.book.findMany({
    where: { AND: [backlog(maxAttempts, bookIds), { id: { notIn: pendingIds } }, { NOT: NEEDS_SYNOPSIS }] },
    select: ENRICHMENT_FIELDS,
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

export function createEnrichmentBatch(anthropicBatchId: string, bookIds: string[], db: Db = prisma) {
  return db.enrichmentBatch.create({ data: { anthropicBatchId, bookIds } });
}

export function findSubmittedBatches(db: Db = prisma) {
  return db.enrichmentBatch.findMany({
    where: { status: EnrichmentBatchStatus.SUBMITTED },
    orderBy: { createdAt: "asc" },
  });
}

export async function findPendingBookIds(db: Db = prisma) {
  const batches = await db.enrichmentBatch.findMany({
    where: { status: EnrichmentBatchStatus.SUBMITTED },
    select: { bookIds: true },
  });
  return batches.flatMap((batch) => batch.bookIds);
}

export async function markBatchCollected(id: string, db: Db = prisma) {
  await db.enrichmentBatch.updateMany({
    where: { id, status: EnrichmentBatchStatus.SUBMITTED },
    data: { status: EnrichmentBatchStatus.COLLECTED, endedAt: new Date() },
  });
}

export async function findEnrichmentLists(db: Db = prisma) {
  const select = { id: true, name: true, description: true };
  const [genres, tropes] = await Promise.all([
    db.genre.findMany({ select, orderBy: { name: "asc" } }),
    db.trope.findMany({ select, orderBy: { name: "asc" } }),
  ]);
  return { genres, tropes };
}

// Adds the AI's genres and tropes without touching a row that's already
// there, USER or AI, and fills tags and length only while they're blank. Only
// ever on a shared book. Returns whether the book was marked enriched.
export async function saveEnrichment(bookId: string, enrichment: Enrichment, db: Db = prisma) {
  const where = { id: bookId, ownerId: null };
  const { count } = await db.book.updateMany({ where: { ...where, aiEnrichedAt: null }, data: { aiEnrichedAt: new Date() } });
  if (count === 0) return false;

  if (enrichment.genreIds.length > 0) {
    await db.bookGenre.createMany({
      data: enrichment.genreIds.map((genreId) => ({ bookId, genreId, source: TagSource.AI })),
      skipDuplicates: true,
    });
  }
  if (enrichment.tropeIds.length > 0) {
    await db.bookTrope.createMany({
      data: enrichment.tropeIds.map((tropeId) => ({ bookId, tropeId, source: TagSource.AI })),
      skipDuplicates: true,
    });
  }
  if (enrichment.tags.length > 0) {
    // The column has no default, so a book saved without tags holds NULL,
    // which `isEmpty` doesn't match.
    await db.book.updateMany({
      where: { ...where, OR: [{ tags: { isEmpty: true } }, { tags: { equals: null } }] },
      data: { tags: enrichment.tags },
    });
  }
  if (enrichment.lengthCategory) {
    await db.book.updateMany({
      where: { ...where, lengthCategory: null },
      data: { lengthCategory: enrichment.lengthCategory },
    });
  }
  return true;
}

export async function recordFailedAttempt(bookId: string, db: Db = prisma) {
  await db.book.updateMany({ where: { id: bookId, ownerId: null }, data: { aiAttempts: { increment: 1 } } });
}
