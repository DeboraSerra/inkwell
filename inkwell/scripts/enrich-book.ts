import "../prisma/load-env";
import { findBookForEnrichment, findEnrichmentLists } from "@/server/enrichment/enrichment.model";
import { enrichmentRequest } from "@/server/enrichment/enrichment.rules";
import { enrichBook } from "@/server/enrichment/enrichment.service";

// Enriches one shared catalog book by hand, to check a real call (5b2). Sends
// the book's title, authors, synopsis and pages to Anthropic; never a private
// book. --dry-run prints the request instead and calls nothing.
// Run with: npx tsx --conditions=react-server scripts/enrich-book.ts <bookId> [--dry-run]
const bookId = process.argv[2];
if (!bookId || bookId.startsWith("--")) {
  console.error("Usage: npx tsx --conditions=react-server scripts/enrich-book.ts <bookId> [--dry-run]");
  process.exit(1);
}

if (process.argv.includes("--dry-run")) {
  const book = await findBookForEnrichment(bookId);
  if (!book) throw new Error("Book not found");
  if (book.ownerId) throw new Error("Private books are never enriched.");
  console.log(JSON.stringify(enrichmentRequest(book, await findEnrichmentLists()), null, 2));
} else {
  console.log(await enrichBook(bookId));
}
process.exit(0);
