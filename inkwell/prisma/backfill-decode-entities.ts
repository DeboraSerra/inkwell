import "./load-env";
import { authorSearchText, dedupeKey } from "@/server/books/dedupe";
import { decodeEntities } from "@/server/books/text";
import { prisma } from "@/server/db";

// Decodes HTML entities ("Snow &amp; Ash") stored by Amazon imports from before
// the import decoded them, then recomputes the fields derived from the text.
// Covers shared and private books, and readers' own authors. Safe to run any
// number of times: a second run changes nothing.
// Run with: npx tsx prisma/backfill-decode-entities.ts [--dry-run]
const dryRun = process.argv.includes("--dry-run");

// Trimmed only when decoded, so a row with no entity always counts as unchanged.
const decode = (text: string) => {
  const decoded = decodeEntities(text);
  return decoded === text ? text : decoded.trim();
};
const sameList = (a: string[], b: string[]) => a.join("\u0000") === b.join("\u0000");

async function backfillBooks() {
  const books = await prisma.book.findMany({
    select: { id: true, title: true, subtitle: true, authors: true },
  });
  let updated = 0;
  for (const book of books) {
    const title = decode(book.title);
    const subtitle = book.subtitle === null ? null : decode(book.subtitle);
    const authors = book.authors.map(decode);
    // Rows with no entity are left alone, even if a derived field is stale.
    if (title === book.title && subtitle === book.subtitle && sameList(authors, book.authors)) continue;
    const data = { title, subtitle, authors, dedupeKey: dedupeKey(title, authors), authorSearch: authorSearchText(authors) };
    console.log(`Book ${book.id}: ${JSON.stringify(book.title)} → ${JSON.stringify(title)}`);
    if (!dryRun) await prisma.book.update({ where: { id: book.id }, data });
    updated++;
  }
  return updated;
}

// A reader's own authors; UserBook has no title or subtitle of its own.
async function backfillUserBooks() {
  const userBooks = await prisma.userBook.findMany({
    where: { authors: { isEmpty: false } },
    select: { id: true, authors: true },
  });
  let updated = 0;
  for (const userBook of userBooks) {
    const authors = userBook.authors.map(decode);
    if (sameList(authors, userBook.authors)) continue;
    const authorSearch = authorSearchText(authors);
    console.log(`UserBook ${userBook.id}: ${JSON.stringify(userBook.authors)} → ${JSON.stringify(authors)}`);
    if (!dryRun) await prisma.userBook.update({ where: { id: userBook.id }, data: { authors, authorSearch } });
    updated++;
  }
  return updated;
}

async function main() {
  const books = await backfillBooks();
  const userBooks = await backfillUserBooks();
  const verb = dryRun ? "Would update" : "Updated";
  console.log(`${verb} ${books} books and ${userBooks} library entries.`);

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
