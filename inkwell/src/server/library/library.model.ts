import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { BookFormat, DatePrecision, ReadingStatus, UserBookSource } from "@/generated/prisma/enums";
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

// This user's books matching any of these ISBNs or dedupe keys, for marking
// search results already in their library.
export function findUserBooksMatching(
  userId: string,
  { isbn13s, dedupeKeys }: { isbn13s: string[]; dedupeKeys: string[] },
  db: Db = prisma,
) {
  return db.userBook.findMany({
    where: { userId, book: { OR: [{ isbn13: { in: isbn13s } }, { dedupeKey: { in: dedupeKeys } }] } },
    select: { status: true, book: { select: { isbn13: true, dedupeKey: true } } },
  });
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
  data: {
    userId: string;
    bookId: string;
    source: UserBookSource;
    audioMinutes?: number | null;
    acquiredAt?: Date | null;
    acquiredAtPrecision?: DatePrecision;
  } & ReadingState,
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
  // Owned in at least one format. Ticked formats already imply it.
  owned?: boolean;
  source?: UserBookSource;
  // Raw text matched against the title and its normalized form against the
  // dedupe key. `author` is matched against any author's name, and `surname`
  // against any author's last word, so "JRR Tolkien" finds "J. R. R. Tolkien".
  // Authors are searched in the catalog and in the reader's own list.
  search?: { text: string; normalized: string; author: string; surname: string };
};

function formatsWhere({ formats, owned }: UserBookFilter) {
  if (formats) return { hasSome: formats };
  return owned ? { isEmpty: false } : undefined;
}

export type UserBookQuery = UserBookFilter & {
  // By date added (the default, newest first), purchase date or title.
  sort?: { by: "added" | "acquired" | "title"; direction: "asc" | "desc" };
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
    formats: formatsWhere(query),
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

// Books with no purchase date go last whichever way purchase dates run; the id
// keeps pages stable when dates tie.
const userBookOrder = (
  sort: UserBookQuery["sort"] = { by: "added", direction: "desc" },
): Prisma.UserBookOrderByWithRelationInput[] => {
  if (sort.by === "acquired") {
    return [{ acquiredAt: { sort: sort.direction, nulls: "last" } }, { addedAt: "desc" }, { id: "asc" }];
  }
  // The title is the catalog's; a reader can't change it.
  if (sort.by === "title") return [{ book: { title: sort.direction } }, { id: "asc" }];
  return [{ addedAt: sort.direction }, { id: "asc" }];
};

export function listUserBooks(userId: string, query: UserBookQuery, db: Db = prisma) {
  return db.userBook.findMany({
    where: userBookWhere(userId, query),
    include: withCatalog,
    orderBy: userBookOrder(query.sort),
    take: query.take,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : { skip: query.skip }),
  });
}

// Every matching book with only what ordering by read dates needs, for the
// orders the database can't do itself (by a date on the book's reads).
export function listUserBookReadDates(userId: string, query: UserBookFilter, db: Db = prisma) {
  return db.userBook.findMany({
    where: userBookWhere(userId, query),
    select: {
      id: true,
      addedAt: true,
      readThroughs: { select: { outcome: true, startedAt: true, endedAt: true, createdAt: true } },
    },
  });
}

// These books with their catalog details, in no particular order.
export function findUserBooksWithCatalog(userId: string, userBookIds: string[], db: Db = prisma) {
  return db.userBook.findMany({ where: { id: { in: userBookIds }, userId }, include: withCatalog });
}

export function countUserBooks(userId: string, query: UserBookFilter, db: Db = prisma) {
  return db.userBook.count({ where: userBookWhere(userId, query) });
}

// When the reader got the book. Only this column changes, so the shelf order
// (addedAt), status and reads stay as they are.
export function updateAcquired(
  userId: string,
  userBookId: string,
  acquired: { acquiredAt: Date | null; acquiredAtPrecision: DatePrecision },
  db: Db = prisma,
) {
  return db.userBook.update({ where: { id: userBookId, userId }, data: acquired });
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
    audioMinutes: number | null;
    acquiredAt: Date | null;
    acquiredAtPrecision: DatePrecision;
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
