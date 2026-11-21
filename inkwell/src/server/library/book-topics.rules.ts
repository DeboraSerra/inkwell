// Which genre and trope a shelf book shows. Pure, so it's unit-tested
// without the database.
import { TagSource } from "@/generated/prisma/enums";
import type { TaggedName } from "@/types/library.type";

// The reader's own pick first (USER, from 5b6), then the oldest; null for none.
export function firstTopic(rows: TaggedName[]) {
  const sorted = [...rows].sort(
    (a, b) =>
      Number(b.source === TagSource.USER) - Number(a.source === TagSource.USER) ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
  return sorted.at(0)?.name ?? null;
}
