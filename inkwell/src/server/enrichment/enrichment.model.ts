import "server-only";
import { TagSource } from "@/generated/prisma/enums";
import { prisma } from "@/server/db";
import type { Enrichment } from "@/types/enrichment.type";
import type { Db } from "@/types/server.type";

export function findBookForEnrichment(bookId: string, db: Db = prisma) {
  return db.book.findUnique({
    where: { id: bookId },
    select: {
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
    },
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
    await db.book.updateMany({ where: { ...where, tags: { isEmpty: true } }, data: { tags: enrichment.tags } });
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
