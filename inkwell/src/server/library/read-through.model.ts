import "server-only";
import type { ReadOutcome } from "@/generated/prisma/enums";
import { prisma, type Db } from "@/server/db";

// ReadThrough has no userId of its own, so reads are scoped through their book.

export type NewRead = {
  userBookId: string;
  startedAt?: Date | null;
  endedAt?: Date | null;
  outcome?: ReadOutcome | null;
};

// The caller must have checked that these books belong to the user: an insert
// has no row to filter on.
export function createReads(reads: NewRead[], db: Db = prisma) {
  return db.readThrough.createMany({ data: reads });
}

// Open reads (no outcome) and DNF reads, newest first, which is all a status
// change needs to look at. Finished reads are never touched.
export function findChangeableReads(userId: string, userBookIds: string[], db: Db = prisma) {
  return db.readThrough.findMany({
    where: {
      userBookId: { in: userBookIds },
      userBook: { userId },
      OR: [{ outcome: null }, { outcome: "DNF" }],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export function closeReads(
  userId: string,
  readIds: string[],
  outcome: ReadOutcome,
  endedAt: Date | null,
  db: Db = prisma,
) {
  return db.readThrough.updateMany({
    where: { id: { in: readIds }, userBook: { userId } },
    data: { outcome, endedAt },
  });
}

export function reopenReads(userId: string, readIds: string[], db: Db = prisma) {
  return db.readThrough.updateMany({
    where: { id: { in: readIds }, userBook: { userId } },
    data: { outcome: null, endedAt: null },
  });
}

export function deleteOpenReads(userId: string, userBookIds: string[], db: Db = prisma) {
  return db.readThrough.deleteMany({
    where: { userBookId: { in: userBookIds }, userBook: { userId }, outcome: null },
  });
}
