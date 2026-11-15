import "./load-env";
import { prisma } from "@/server/db";
import { type DocMerge, planDocMerges } from "@/server/imports/duplicate-docs.rules";

// Merges the documents a Docs re-import added twice (Phase 3, "Fix:
// re-importing Docs duplicates documents"). For each pair, the original
// library entry keeps its status, reads and addedAt, gains the copy's
// formats and the earlier purchase date, and moves to the private book; the
// copy's entry is deleted, then the shared book if nobody else has it.
// Safe to run any number of times: a merged pair is no longer a pair.
// Run with: npx tsx prisma/merge-duplicate-docs.ts [--dry-run]
const dryRun = process.argv.includes("--dry-run");

async function loadEntries() {
  const privateKeys = await prisma.book.findMany({
    where: { ownerId: { not: null } },
    select: { dedupeKey: true },
    distinct: ["dedupeKey"],
  });
  const rows = await prisma.userBook.findMany({
    where: { book: { asin: null, dedupeKey: { in: privateKeys.map((b) => b.dedupeKey) } } },
    select: {
      id: true,
      userId: true,
      bookId: true,
      status: true,
      formats: true,
      acquiredAt: true,
      acquiredAtPrecision: true,
      book: { select: { ownerId: true, asin: true, dedupeKey: true, title: true } },
      _count: { select: { readThroughs: true } },
    },
  });
  return rows.map(({ _count, ...row }) => ({ ...row, readCount: _count.readThroughs }));
}

async function applyMerge({ userId, keep, drop, data }: DocMerge) {
  return prisma.$transaction(async (tx) => {
    // The copy goes first, since (userId, bookId) is unique.
    const removed = await tx.userBook.deleteMany({ where: { id: drop.id, userId, bookId: drop.bookId } });
    if (removed.count !== 1) throw new Error(`Copy ${drop.id} changed since it was read`);
    const moved = await tx.userBook.updateMany({ where: { id: keep.id, userId, bookId: keep.bookId }, data });
    if (moved.count !== 1) throw new Error(`Original ${keep.id} changed since it was read`);
    const others = await tx.userBook.count({ where: { bookId: keep.bookId } });
    if (others > 0) return false;
    await tx.book.deleteMany({ where: { id: keep.bookId, ownerId: null, asin: null } });
    return true;
  });
}

async function main() {
  const entries = await loadEntries();
  const { merges, skips } = planDocMerges(entries);

  for (const merge of merges) {
    const { keep, drop, data } = merge;
    console.log(
      `${JSON.stringify(keep.book.title)} (user ${merge.userId}): keep ${keep.id} on ${keep.status}` +
        ` [${keep.formats}] → book ${data.bookId} [${data.formats}]; delete ${drop.id}`,
    );
  }
  for (const skip of skips) console.log(`Skipped ${JSON.stringify(skip.dedupeKey)} (user ${skip.userId}): ${skip.reason}`);

  let deletedBooks = 0;
  if (!dryRun) for (const merge of merges) if (await applyMerge(merge)) deletedBooks++;

  const verb = dryRun ? "Would merge" : "Merged";
  console.log(`${verb} ${merges.length} pairs and skipped ${skips.length}.`);
  if (!dryRun) console.log(`Deleted ${deletedBooks} shared books nobody else had.`);
}

try {
  await main();
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
