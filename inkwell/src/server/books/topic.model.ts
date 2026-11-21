import "server-only";
import { prisma } from "@/server/db";
import type { Db } from "@/types/server.type";

// The curated genre and trope names, for the shelf's filter, each trope with
// its genres (GenreTrope).
export async function listTopicNames(db: Db = prisma) {
  const [genres, tropes] = await Promise.all([
    db.genre.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
    db.trope.findMany({
      select: { name: true, genres: { select: { genre: { select: { name: true } } } } },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    genres: genres.map(({ name }) => name),
    tropes: tropes.map((trope) => ({ name: trope.name, genres: trope.genres.map(({ genre }) => genre.name) })),
  };
}

export async function findGenreId(name: string, db: Db = prisma) {
  return (await db.genre.findUnique({ where: { name }, select: { id: true } }))?.id ?? null;
}

export async function findTropeId(name: string, db: Db = prisma) {
  return (await db.trope.findUnique({ where: { name }, select: { id: true } }))?.id ?? null;
}
