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

describe("listUserBooks search", () => {
  it("finds the title, the normalized key and any author's name or surname", async () => {
    await model.listUserBooks(USER, {
      take: 10,
      search: {
        text: "Rebecca Yarros",
        normalized: "rebecca yarros",
        author: "rebecca yarros",
        surname: "yarros",
        tag: "rebecca yarros",
      },
    });
    const authors = [{ authorSearch: { contains: "rebecca yarros" } }, { authorSearch: { contains: " yarros|" } }];
    expect(calls[0].args.where).toMatchObject({
      // The reader's own authors, then the catalog's.
      OR: [
        ...authors,
        { book: { OR: expect.arrayContaining([{ dedupeKey: { contains: "rebecca yarros" } }, ...authors]) } },
      ],
    });
  });

  it("doesn't match every book when the text normalizes to nothing", async () => {
    await model.listUserBooks(USER, {
      take: 10,
      search: { text: "!!", normalized: "", author: "", surname: "", tag: "!!" },
    });
    expect(calls[0].args.where).toMatchObject({
      OR: [{ book: { OR: [{ title: { contains: "!!", mode: "insensitive" } }, { tagSearch: { contains: "!!" } }] } }],
    });
  });

  it("finds part of a tag", async () => {
    await model.listUserBooks(USER, {
      take: 10,
      search: { text: "School", normalized: "school", author: "school", surname: "school", tag: "school" },
    });
    const where = calls[0].args.where as { OR: { book?: { OR: unknown[] } }[] };
    expect(where.OR.at(-1)?.book?.OR).toContainEqual({ tagSearch: { contains: "school" } });
  });
});

describe("listUserBooks genres and tropes", () => {
  it("matches any genre ticked and any trope ticked, by name", async () => {
    await model.listUserBooks(USER, { take: 10, genres: ["Romance", "Fantasy"], tropes: ["Enemies to Lovers"] });
    expect(calls[0].args.where).toMatchObject({
      userId: USER,
      AND: [
        { book: { genres: { some: { genre: { name: { in: ["Romance", "Fantasy"] } } } } } },
        { book: { tropes: { some: { trope: { name: { in: ["Enemies to Lovers"] } } } } } },
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
