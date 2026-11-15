import "server-only";
import type { ReadOutcome } from "@/generated/prisma/enums";
import { prisma } from "@/server/db";
import type { NewRead } from "@/types/library.type";
import type { Db } from "@/types/server.type";

// ReadThrough has no userId of its own, so reads are scoped through their book.

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
    data: { outcome: null, endedAt: null, endedAtPrecision: "DAY" },
  });
}

export function deleteOpenReads(userId: string, userBookIds: string[], db: Db = prisma) {
  return db.readThrough.deleteMany({
    where: { userBookId: { in: userBookIds }, userBook: { userId }, outcome: null },
  });
}

// The read entered most recently, which is the one a status change just
// created. "Latest" by date is decided in the service, from findBookReads.
export function findNewestRead(userId: string, userBookId: string, db: Db = prisma) {
  return db.readThrough.findFirst({
    where: { userBookId, userBook: { userId } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export function findBookReads(userId: string, userBookId: string, db: Db = prisma) {
  return db.readThrough.findMany({ where: { userBookId, userBook: { userId } } });
}

// Only a read of this book, belonging to this user, is changed. Returns how
// many rows changed, which is 0 for anyone else's read.
export async function updateBookReadDates(
  userId: string,
  userBookId: string,
  readId: string,
  dates: Pick<NewRead, "startedAt" | "startedAtPrecision" | "endedAt" | "endedAtPrecision">,
  db: Db = prisma,
) {
  const { count } = await db.readThrough.updateMany({
    where: { id: readId, userBookId, userBook: { userId } },
    data: dates,
  });
  return count;
}

export function updateReadDates(
  userId: string,
  readId: string,
  dates: Pick<NewRead, "startedAt" | "startedAtPrecision" | "endedAt" | "endedAtPrecision">,
  db: Db = prisma,
) {
  return db.readThrough.updateMany({ where: { id: readId, userBook: { userId } }, data: dates });
}
