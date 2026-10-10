import "./load-env";
import { prisma } from "@/lib/prisma";
import genres from "../assets/lists/genres";
import statuses from "../assets/lists/status";
import tropes from "../assets/lists/tropes";

async function main() {
  for (const status of statuses) {
    await prisma.status.create({
      data: status,
    });
  }
  for (const genre of genres) {
    await prisma.genre.create({
      data: genre,
    });
  }
  for (const trope of tropes) {
    await prisma.trope.create({
      data: trope,
    });
  }
}

try {
  await main();
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
