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
  for (const { name, description } of tropes) {
    await prisma.trope.upsert({
      where: { name },
      create: { name, description },
      update: { description },
    });
  }
  console.log(`Seeded ${genres.length} genres and ${tropes.length} tropes.`);
}

try {
  await main();
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
