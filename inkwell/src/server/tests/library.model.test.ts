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

describe("listUserBooks", () => {
  it("matches books owned in any of the formats", async () => {
    await model.listUserBooks(USER, { take: 10, formats: [BookFormat.EBOOK, BookFormat.AUDIO] });
    expect(calls[0].args.where).toMatchObject({ formats: { hasSome: ["EBOOK", "AUDIO"] } });
  });
});

describe("listUserBooks search", () => {
  it("finds the title, the normalized key and any author's name or surname", async () => {
    await model.listUserBooks(USER, {
      take: 10,
      search: { text: "Rebecca Yarros", normalized: "rebecca yarros", author: "rebecca yarros", surname: "yarros" },
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
    await model.listUserBooks(USER, { take: 10, search: { text: "!!", normalized: "", author: "", surname: "" } });
    expect(calls[0].args.where).toMatchObject({
      OR: [{ book: { OR: [{ title: { contains: "!!", mode: "insensitive" } }] } }],
    });
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
      authors: [],
      authorSearch: "",
      coverUrl: null,
    });
    expect(calls[0].args.where).toEqual({ id: "ub", userId: USER });
  });

  it("scopes read dates by user", async () => {
    await reads.findLatestRead(USER, "ub");
    await reads.updateReadDates(USER, "r", { startedAt: null });
    expect(calls[0].args.where).toMatchObject({ userBook: { userId: USER } });
    expect(calls[1].args.where).toMatchObject({ userBook: { userId: USER } });
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
