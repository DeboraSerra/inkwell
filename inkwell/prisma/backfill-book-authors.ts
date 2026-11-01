import "./load-env";
import { MetadataSource } from "@/generated/prisma/enums";
import { authorSearchText, dedupeKey, splitAmazonAuthors } from "@/server/books/dedupe";
import { prisma } from "@/server/db";

// Brings existing books up to date with dedupe.ts: splits Amazon authors that
// were stored as one comma-separated name, then recomputes the derived fields.
// Safe to run any number of times. Run with: npx tsx prisma/backfill-book-authors.ts
async function main() {
  const books = await prisma.book.findMany();
  let updated = 0;
  for (const book of books) {
    const authors =
      book.metadataSource === MetadataSource.AMAZON ? book.authors.flatMap(splitAmazonAuthors) : book.authors;
    const data = {
      authors,
      dedupeKey: dedupeKey(book.title, authors),
      authorSearch: authorSearchText(authors),
    };
    const unchanged =
      data.dedupeKey === book.dedupeKey &&
      data.authorSearch === book.authorSearch &&
      authors.join(";") === book.authors.join(";");
    if (unchanged) continue;
    await prisma.book.update({ where: { id: book.id }, data });
    updated++;
  }
  console.log(`Updated ${updated} of ${books.length} books.`);

  const keys = await prisma.book.groupBy({ by: ["dedupeKey"], _count: true, having: { dedupeKey: { _count: { gt: 1 } } } });
  console.log(`Dedupe keys shared by more than one book: ${keys.length}.`);
}

try {
  await main();
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
