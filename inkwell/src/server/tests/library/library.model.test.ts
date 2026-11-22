import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookFormat, ReadingStatus, UserBookSource } from "@/generated/prisma/enums";

// A fake Prisma client that records every call.
type Args = {
  where?: { userId?: string; userId_bookId?: { userId?: string }; userBook?: { userId?: string } };
  data?: { userId?: string }[];
};
const calls: { method: string; args: Args }[] = [];
const results: Record<string, unknown[]> = {};

const recorder = () =>
  new Proxy(
    {},
    {
      get: (_target, method: string) =>
        vi.fn(async (args: Args) => {
          calls.push({ method, args });
          return results[method]?.shift() ?? null;
        }),
    },
  );

vi.mock("@/server/db", () => ({ prisma: { userBook: recorder(), readThrough: recorder() } }));

const model = await import("@/server/library/library.model");
const reads = await import("@/server/library/read-through.model");

const USER = "user-1";
const state = { status: ReadingStatus.TO_READ, formats: [BookFormat.PHYSICAL] };
const newBook = { userId: USER, bookId: "book-1", source: UserBookSource.MANUAL, ...state };

beforeEach(() => {
  calls.length = 0;
  for (const key of Object.keys(results)) delete results[key];
  results.createManyAndReturn = [[{ id: "new" }]];
});

describe("every model function is scoped by userId", () => {
  it.each([
    ["findUserBookByBookId", () => model.findUserBookByBookId(USER, "b")],
    ["findUserBook", () => model.findUserBook(USER, "ub")],
    ["findUserBooks", () => model.findUserBooks(USER, ["ub"])],
    ["findUserBookWithCatalog", () => model.findUserBookWithCatalog(USER, "ub")],
    ["createUserBook", () => model.createUserBook(newBook)],
    ["listUserBooks", () => model.listUserBooks(USER, { take: 10, formats: [BookFormat.EBOOK] })],
    ["countUserBooks", () => model.countUserBooks(USER, { formats: [BookFormat.EBOOK] })],
    ["listUserBookReadDates", () => model.listUserBookReadDates(USER, { formats: [BookFormat.EBOOK] })],
    ["findUserBooksWithCatalog", () => model.findUserBooksWithCatalog(USER, ["ub"])],
    ["updateUserBookState", () => model.updateUserBookState(USER, "ub", state)],
    ["updateUserBookStatuses", () => model.updateUserBookStatuses(USER, ["ub"], ReadingStatus.FINISHED)],
    ["findChangeableReads", () => reads.findChangeableReads(USER, ["ub"])],
    ["closeReads", () => reads.closeReads(USER, ["r"], "DNF", null)],
    ["reopenReads", () => reads.reopenReads(USER, ["r"])],
    ["deleteOpenReads", () => reads.deleteOpenReads(USER, ["ub"])],
  ])("%s", async (_name, run) => {
    await run();
    expect(calls).toHaveLength(1);
    const { where, data } = calls[0].args;
    const scoped = where?.userId ?? where?.userId_bookId?.userId ?? where?.userBook?.userId ?? data?.[0]?.userId;
    expect(scoped).toBe(USER);
  });
});

describe("createUserBook", () => {
  it("returns the new row", async () => {
    await expect(model.createUserBook(newBook)).resolves.toEqual({ id: "new" });
  });

  it("returns null when the user already has the book", async () => {
    results.createManyAndReturn = [[]];
    await expect(model.createUserBook(newBook)).resolves.toBeNull();
  });

  it("uses ON CONFLICT, which can't abort a surrounding transaction", async () => {
    await model.createUserBook(newBook);
    expect(calls[0].args).toMatchObject({ skipDuplicates: true });
  });
});

describe("owned books", () => {
  it("lists books with any format and no status filter", async () => {
    await model.listUserBooks(USER, { take: 10, owned: true });
    expect(calls[0].args.where).toMatchObject({ userId: USER, status: undefined, formats: { isEmpty: false } });
  });

  it("counts with the same filter", async () => {
    await model.countUserBooks(USER, { owned: true });
    expect(calls[0].args.where).toMatchObject({ userId: USER, status: undefined, formats: { isEmpty: false } });
  });

  it("narrows to the ticked formats, which already means owned", async () => {
    await model.listUserBooks(USER, { take: 10, owned: true, formats: [BookFormat.AUDIO] });
    expect(calls[0].args.where).toMatchObject({ formats: { hasSome: ["AUDIO"] } });
  });
});

describe("listUserBooks", () => {
  it("matches books owned in any of the formats", async () => {
    await model.listUserBooks(USER, { take: 10, formats: [BookFormat.EBOOK, BookFormat.AUDIO] });
    expect(calls[0].args.where).toMatchObject({ formats: { hasSome: ["EBOOK", "AUDIO"] } });
  });

  it.each([
    [{ by: "acquired", direction: "desc" }, [{ acquiredAt: { sort: "desc", nulls: "last" } }, { addedAt: "desc" }, { id: "asc" }]],
    [{ by: "acquired", direction: "asc" }, [{ acquiredAt: { sort: "asc", nulls: "last" } }, { addedAt: "desc" }, { id: "asc" }]],
    [{ by: "added", direction: "asc" }, [{ addedAt: "asc" }, { id: "asc" }]],
    [{ by: "title", direction: "asc" }, [{ book: { title: "asc" } }, { id: "asc" }]],
    [{ by: "title", direction: "desc" }, [{ book: { title: "desc" } }, { id: "asc" }]],
    [undefined, [{ addedAt: "desc" }, { id: "asc" }]],
  ] as const)("orders by %j, with undated purchases last", async (sort, orderBy) => {
    await model.listUserBooks(USER, { take: 10, sort });
    expect((calls[0].args as unknown as { orderBy: unknown }).orderBy).toEqual(orderBy);
  });
});

const searchFor = (text: string, normalized = text.toLowerCase(), tag = text.toLowerCase()) => ({
  text,
  normalized,
  author: text.toLowerCase(),
  surname: text.toLowerCase().split(" ").at(-1) ?? "",
  tag,
});
const insensitive = (text: string) => ({ contains: text, mode: "insensitive" });
type Where = { OR: unknown[]; AND: unknown[] };

describe("listUserBooks search", () => {
  it("finds the title, the normalized key and any author's name or surname", async () => {
    await model.listUserBooks(USER, { take: 10, search: searchFor("Rebecca Yarros") });
    const authors = [{ authorSearch: { contains: "rebecca yarros" } }, { authorSearch: { contains: " yarros|" } }];
    const where = calls[0].args.where as unknown as Where;
    // The reader's own authors, then the catalog's.
    expect(where.OR.slice(0, 3)).toEqual([
      ...authors,
      { book: { OR: [{ title: insensitive("Rebecca Yarros") }, { dedupeKey: { contains: "rebecca yarros" } }, ...authors] } },
    ]);
  });

  it("doesn't match every book when the text normalizes to nothing", async () => {
    await model.listUserBooks(USER, { take: 10, search: { text: "!!", normalized: "", author: "", surname: "", tag: "!!" } });
    const where = calls[0].args.where as unknown as Where;
    expect(where.OR[0]).toEqual({ book: { OR: [{ title: insensitive("!!") }] } });
  });

  it("finds part of a tag: the reader's once they've edited them, else the catalog's", async () => {
    await model.listUserBooks(USER, { take: 10, search: searchFor("School") });
    const where = calls[0].args.where as unknown as Where;
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { tagsEdited: true, tagSearch: { contains: "school" } },
        { tagsEdited: false, book: { tagSearch: { contains: "school" } } },
      ]),
    );
  });

  it("finds part of a genre or trope name, the reader's or the catalog's", async () => {
    await model.listUserBooks(USER, { take: 10, search: searchFor("lovers") });
    const where = calls[0].args.where as unknown as Where;
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { genreEdited: true, genre: { name: insensitive("lovers") } },
        { genreEdited: false, book: { genres: { some: { genre: { name: insensitive("lovers") } } } } },
        { tropeEdited: true, trope: { name: insensitive("lovers") } },
        { tropeEdited: false, book: { tropes: { some: { trope: { name: insensitive("lovers") } } } } },
      ]),
    );
  });
});

describe("listUserBooks genres and tropes", () => {
  it("matches any genre ticked and any trope ticked, the reader's or the catalog's", async () => {
    await model.listUserBooks(USER, { take: 10, genres: ["Romance", "Fantasy"], tropes: ["Enemies to Lovers"] });
    expect(calls[0].args.where).toMatchObject({
      userId: USER,
      AND: [
        {
          OR: [
            { genreEdited: true, genre: { name: { in: ["Romance", "Fantasy"] } } },
            { genreEdited: false, book: { genres: { some: { genre: { name: { in: ["Romance", "Fantasy"] } } } } } },
          ],
        },
        {
          OR: [
            { tropeEdited: true, trope: { name: { in: ["Enemies to Lovers"] } } },
            { tropeEdited: false, book: { tropes: { some: { trope: { name: { in: ["Enemies to Lovers"] } } } } } },
          ],
        },
      ],
    });
  });

  it("adds no condition without them", async () => {
    await model.listUserBooks(USER, { take: 10 });
    expect(calls[0].args.where).toMatchObject({ AND: [] });
  });
});

describe("removing and editing a book", () => {
  it("only deletes the user's own row", async () => {
    results.deleteMany = [{ count: 1 }];
    await expect(model.deleteUserBook(USER, "ub")).resolves.toBe(1);
    expect(calls[0].args.where).toEqual({ id: "ub", userId: USER });
  });

  it("only deletes the user's own rows in bulk", async () => {
    results.deleteMany = [{ count: 2 }];
    await expect(model.deleteUserBooks(USER, ["a", "b"])).resolves.toBe(2);
    expect(calls[0].args.where).toEqual({ id: { in: ["a", "b"] }, userId: USER });
  });

  it("scopes an edit by user", async () => {
    await model.updateEditedUserBook(USER, "ub", {
      status: "TO_READ",
      formats: [],
      pageCount: 310,
      audioMinutes: 750,
      acquiredAt: null,
      acquiredAtPrecision: "DAY",
      authors: [],
      authorSearch: "",
      coverUrl: null,
    });
    expect(calls[0].args.where).toEqual({ id: "ub", userId: USER });
  });

  it("scopes read dates by user", async () => {
    await reads.findNewestRead(USER, "ub");
    await reads.findBookReads(USER, "ub");
    await reads.updateReadDates(USER, "r", { startedAt: null });
    results.updateMany = [{ count: 1 }];
    await expect(reads.updateBookReadDates(USER, "ub", "r", { startedAt: null })).resolves.toBe(1);
    for (const call of calls) expect(call.args.where).toMatchObject({ userBook: { userId: USER } });
    expect(calls[3].args.where).toMatchObject({ id: "r", userBookId: "ub" });
  });
});

describe("read history safety", () => {
  it("only ever deletes open reads", async () => {
    await reads.deleteOpenReads(USER, ["ub"]);
    expect(calls[0].args.where).toMatchObject({ outcome: null });
  });

  it("never loads finished reads to change them", async () => {
    await reads.findChangeableReads(USER, ["ub"]);
    expect(calls[0].args.where).toMatchObject({ OR: [{ outcome: null }, { outcome: "DNF" }] });
  });
});

describe("the rest of the queries", () => {
  it("matches search results against this user's books only", async () => {
    await model.findUserBooksMatching(USER, { isbn13s: ["978"], dedupeKeys: ["k"] });
    expect(calls[0].args.where).toEqual({
      userId: USER,
      book: { OR: [{ isbn13: { in: ["978"] } }, { dedupeKey: { in: ["k"] } }] },
    });
  });

  it("changes only the acquired date of the user's own book", async () => {
    const acquired = { acquiredAt: new Date("2026-01-01"), acquiredAtPrecision: "MONTH" as const };
    await model.updateAcquired(USER, "ub", acquired);
    expect(calls[0]).toEqual({ method: "update", args: { where: { id: "ub", userId: USER }, data: acquired } });
  });

  it("filters by the given statuses", async () => {
    await model.countUserBooks(USER, { status: [ReadingStatus.READING, ReadingStatus.DNF] });
    expect(calls[0].args.where).toMatchObject({ status: { in: ["READING", "DNF"] } });
  });

  it("pages from a cursor, skipping the cursor's own row", async () => {
    await model.listUserBooks(USER, { take: 10, cursor: "ub-9" });
    expect(calls[0].args).toMatchObject({ cursor: { id: "ub-9" }, skip: 1, take: 10 });
  });

  it("pages by offset without a cursor", async () => {
    await model.listUserBooks(USER, { take: 10, skip: 20 });
    expect(calls[0].args).toMatchObject({ skip: 20 });
    expect(calls[0].args).not.toHaveProperty("cursor");
  });

  it("leaves out tag matches when the search has no tag text", async () => {
    await model.listUserBooks(USER, { take: 10, search: { text: "x", normalized: "x", author: "", surname: "", tag: "" } });
    expect(JSON.stringify(calls[0].args.where)).not.toContain("tagSearch");
  });

  it("uses the transaction passed in", async () => {
    const findMany = vi.fn(async () => []);
    await model.findUserBooksMatching(USER, { isbn13s: [], dedupeKeys: [] }, { userBook: { findMany } } as never);
    expect(findMany).toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });
});
