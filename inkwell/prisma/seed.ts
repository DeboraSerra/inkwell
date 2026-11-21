import "./load-env";
import { prisma } from "@/server/db";
import genres from "../assets/lists/genres";
import tropes from "../assets/lists/tropes";

// Upsert by name so the seed can run any number of times.
async function main() {
  for (const { name, description } of genres) {
    await prisma.genre.upsert({
      where: { name },
      create: { name, description },
      update: { description },
    });
  }
  const genreIds = new Map(
    (await prisma.genre.findMany({ select: { id: true, name: true } })).map((genre) => [genre.name, genre.id]),
  );
  let links = 0;
  for (const { name, description, genres: tropeGenres } of tropes) {
    const trope = await prisma.trope.upsert({
      where: { name },
      create: { name, description },
      update: { description },
    });
    // The list is the source of truth: links it no longer has are removed.
    const ids = tropeGenres.map((genre) => {
      const id = genreIds.get(genre);
      if (!id) throw new Error(`Trope "${name}" names an unknown genre: ${genre}`);
      return id;
    });
    await prisma.genreTrope.deleteMany({ where: { tropeId: trope.id, genreId: { notIn: ids } } });
    await prisma.genreTrope.createMany({
      data: ids.map((genreId) => ({ genreId, tropeId: trope.id })),
      skipDuplicates: true,
    });
    links += ids.length;
  }
  console.log(`Seeded ${genres.length} genres, ${tropes.length} tropes and ${links} genre-trope links.`);
}

try {
  await main();
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
