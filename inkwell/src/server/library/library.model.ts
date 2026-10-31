import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Ownership, ReadingStatus, UserBookSource } from "@/generated/prisma/enums";
import { prisma, type Db } from "@/server/db";
import type { ReadingState } from "./status.rules";

// Every function takes the user's id and filters by it, so one user can never
// read or change another user's books.

const withCatalog = {
  book: {
    include: {
      genres: { include: { genre: true } },
      tropes: { include: { trope: true } },
    },
  },
} satisfies Prisma.UserBookInclude;

export function findUserBookByBookId(userId: string, bookId: string, db: Db = prisma) {
  return db.userBook.findUnique({ where: { userId_bookId: { userId, bookId } } });
}

export function findUserBook(userId: string, userBookId: string, db: Db = prisma) {
  return db.userBook.findFirst({ where: { id: userBookId, userId } });
}

export function findUserBookWithCatalog(userId: string, userBookId: string, db: Db = prisma) {
  return db.userBook.findFirst({ where: { id: userBookId, userId }, include: withCatalog });
}

const isUniqueViolation = (error: unknown) => (error as { code?: string }).code === "P2002";

// Returns null instead of throwing when the user already has this book.
export async function createUserBook(
  data: { userId: string; bookId: string; source: UserBookSource } & ReadingState,
  db: Db = prisma,
) {
  try {
    return await db.userBook.create({ data });
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

export type UserBookQuery = {
  status?: ReadingStatus[];
  ownership?: Ownership[];
  source?: UserBookSource;
  // Raw text matched against the title, and its normalized form matched
  // against the dedupe key (title + first author's surname).
  search?: { text: string; normalized: string };
  take: number;
  cursor?: string;
};

export function listUserBooks(userId: string, query: UserBookQuery, db: Db = prisma) {
  const { search } = query;
  return db.userBook.findMany({
    where: {
      userId,
      status: query.status ? { in: query.status } : undefined,
      ownership: query.ownership ? { in: query.ownership } : undefined,
      source: query.source,
      book: search
        ? {
            OR: [
              { title: { contains: search.text, mode: "insensitive" } },
              { dedupeKey: { contains: search.normalized } },
            ],
          }
        : undefined,
    },
    include: withCatalog,
    orderBy: [{ addedAt: "desc" }, { id: "asc" }],
    take: query.take,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
}

export function updateUserBookState(
  userId: string,
  userBookId: string,
  { status, ownership, startedAt, finishedAt }: ReadingState,
  db: Db = prisma,
) {
  return db.userBook.update({
    where: { id: userBookId, userId },
    data: { status, ownership, startedAt, finishedAt },
  });
}
