import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { BookFormat, ReadingStatus, UserBookSource } from "@/generated/prisma/enums";
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
  readThroughs: { orderBy: { createdAt: "desc" } },
} satisfies Prisma.UserBookInclude;

export function findUserBookByBookId(userId: string, bookId: string, db: Db = prisma) {
  return db.userBook.findUnique({ where: { userId_bookId: { userId, bookId } } });
}

export function findUserBook(userId: string, userBookId: string, db: Db = prisma) {
  return db.userBook.findFirst({ where: { id: userBookId, userId } });
}

export function findUserBooks(userId: string, userBookIds: string[], db: Db = prisma) {
  return db.userBook.findMany({ where: { id: { in: userBookIds }, userId } });
}

export function findUserBookWithCatalog(userId: string, userBookId: string, db: Db = prisma) {
  return db.userBook.findFirst({ where: { id: userBookId, userId }, include: withCatalog });
}

// Returns null when the user already has this book. Uses ON CONFLICT rather
// than catching a unique-key error, which would abort a surrounding transaction.
export async function createUserBook(
  data: { userId: string; bookId: string; source: UserBookSource } & ReadingState,
  db: Db = prisma,
) {
  const created = await db.userBook.createManyAndReturn({
    data: [data],
    skipDuplicates: true,
  });
  return created.at(0) ?? null;
}

export type UserBookFilter = {
  status?: ReadingStatus[];
  // Owned in any of these formats.
  formats?: BookFormat[];
  source?: UserBookSource;
  // Raw text matched against the title and its normalized form against the
  // dedupe key. `author` is matched against any author's name, and `surname`
  // against any author's last word, so "JRR Tolkien" finds "J. R. R. Tolkien".
  // Authors are searched in the catalog and in the reader's own list.
  search?: { text: string; normalized: string; author: string; surname: string };
};

export type UserBookQuery = UserBookFilter & {
  take: number;
  cursor?: string;
  skip?: number;
};

const userBookWhere = (userId: string, query: UserBookFilter) => {
  const { search } = query;
  const authorMatches = search
    ? [
        ...(search.author ? [{ authorSearch: { contains: search.author } }] : []),
        ...(search.surname ? [{ authorSearch: { contains: ` ${search.surname}|` } }] : []),
      ]
    : [];
  return {
    userId,
    status: query.status ? { in: query.status } : undefined,
    formats: query.formats ? { hasSome: query.formats } : undefined,
    source: query.source,
    OR: search
      ? [
          ...authorMatches,
          {
            book: {
              OR: [
                { title: { contains: search.text, mode: "insensitive" as const } },
                // Text that normalizes to nothing ("!!") would otherwise match every book.
                ...(search.normalized ? [{ dedupeKey: { contains: search.normalized } }] : []),
                ...authorMatches,
              ],
            },
          },
        ]
      : undefined,
  } satisfies Prisma.UserBookWhereInput;
};

export function listUserBooks(userId: string, query: UserBookQuery, db: Db = prisma) {
  return db.userBook.findMany({
    where: userBookWhere(userId, query),
    include: withCatalog,
    orderBy: [{ addedAt: "desc" }, { id: "asc" }],
    take: query.take,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : { skip: query.skip }),
  });
}

export function countUserBooks(userId: string, query: UserBookFilter, db: Db = prisma) {
  return db.userBook.count({ where: userBookWhere(userId, query) });
}

export function updateUserBookState(
  userId: string,
  userBookId: string,
  { status, formats }: ReadingState,
  db: Db = prisma,
) {
  return db.userBook.update({
    where: { id: userBookId, userId },
    data: { status, formats },
  });
}

export function updateEditedUserBook(
  userId: string,
  userBookId: string,
  data: ReadingState & {
    pageCount: number | null;
    authors: string[];
    authorSearch: string;
    coverUrl: string | null;
  },
  db: Db = prisma,
) {
  return db.userBook.update({ where: { id: userBookId, userId }, data });
}

// Removes the book from this user's library, and its reads by cascade. The
// catalog book stays. Returns how many rows went, which is 0 for someone else's.
export async function deleteUserBook(userId: string, userBookId: string, db: Db = prisma) {
  const { count } = await db.userBook.deleteMany({ where: { id: userBookId, userId } });
  return count;
}

export async function deleteUserBooks(userId: string, userBookIds: string[], db: Db = prisma) {
  const { count } = await db.userBook.deleteMany({ where: { id: { in: userBookIds }, userId } });
  return count;
}

export function updateUserBookStatuses(
  userId: string,
  userBookIds: string[],
  status: ReadingStatus,
  db: Db = prisma,
) {
  return db.userBook.updateMany({
    where: { id: { in: userBookIds }, userId },
    data: { status },
  });
}
