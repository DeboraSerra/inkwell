import { beforeEach, describe, expect, it, vi } from "vitest";
import { findOrCreateAmazonBook, findOrCreateAmazonDoc } from "@/server/books/book.service";
import { addBookToLibrary } from "@/server/library/library.service";

vi.mock("@/server/books/book.service");
vi.mock("@/server/library/library.service");
vi.mock("@/server/db", () => ({ transaction: (fn: (tx: unknown) => unknown) => fn("tx") }));

const { importAmazonBooks } = await import("@/server/imports/imports.service");
const book = (title: string) => ({ title, authors: ["A"] });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(findOrCreateAmazonBook).mockResolvedValue({ id: "b1", ownerId: null } as never);
});

describe("importAmazonBooks", () => {
  it("adds each book as an ebook for this user and counts new and existing", async () => {
    vi.mocked(addBookToLibrary)
      .mockResolvedValueOnce({ created: true } as never)
      .mockResolvedValueOnce({ created: false } as never);
    await expect(importAmazonBooks("user-1", [book("x"), book("y")])).resolves.toEqual({ created: 1, existing: 1, sharedBookIds: ["b1"] });
    expect(addBookToLibrary).toHaveBeenCalledWith(
      "user-1",
      { bookId: "b1", formats: ["EBOOK"], source: "AMAZON_IMPORT" },
      "tx",
    );
  });

  it("does nothing for an empty list", async () => {
    await expect(importAmazonBooks("user-1", [])).resolves.toEqual({ created: 0, existing: 0, sharedBookIds: [] });
    expect(addBookToLibrary).not.toHaveBeenCalled();
  });
});

describe("purchase dates", () => {
  const acquired = { date: new Date("2021-10-05T00:00:00Z"), precision: "DAY" as const };

  it("gives the date to the reader's copy and keeps it out of the catalog", async () => {
    vi.mocked(addBookToLibrary).mockResolvedValue({ created: true } as never);
    await importAmazonBooks("user-1", [{ ...book("x"), acquired }]);
    expect(findOrCreateAmazonBook).toHaveBeenCalledWith({ title: "x", authors: ["A"] }, "tx");
    expect(addBookToLibrary).toHaveBeenCalledWith("user-1", expect.objectContaining({ acquired }), "tx");
  });
});

describe("importAmazonDocs", () => {
  it("adds nothing when the same Docs page is imported twice", async () => {
    const { importAmazonDocs } = await import("@/server/imports/imports.service");
    vi.mocked(findOrCreateAmazonDoc).mockResolvedValue({ id: "doc-1", ownerId: "user-1" } as never);
    vi.mocked(addBookToLibrary)
      .mockResolvedValueOnce({ created: true } as never)
      .mockResolvedValueOnce({ created: false } as never);
    await expect(importAmazonDocs("user-1", [book("notes")])).resolves.toEqual({ created: 1, existing: 0, sharedBookIds: [] });
    await expect(importAmazonDocs("user-1", [book("notes")])).resolves.toEqual({ created: 0, existing: 1, sharedBookIds: [] });
    expect(findOrCreateAmazonDoc).toHaveBeenNthCalledWith(2, "user-1", { title: "notes", authors: ["A"] }, "tx");
    expect(vi.mocked(addBookToLibrary).mock.calls.map((call) => call[1].bookId)).toEqual(["doc-1", "doc-1"]);
  });
});

describe("books for enrichment", () => {
  it("lists only shared books new to this library, never private ones", async () => {
    const { importAmazonDocs } = await import("@/server/imports/imports.service");
    vi.mocked(findOrCreateAmazonDoc)
      .mockResolvedValueOnce({ id: "shared-1", ownerId: null } as never)
      .mockResolvedValueOnce({ id: "private-1", ownerId: "user-1" } as never)
      .mockResolvedValueOnce({ id: "shared-2", ownerId: null } as never);
    vi.mocked(addBookToLibrary)
      .mockResolvedValueOnce({ created: true } as never)
      .mockResolvedValueOnce({ created: true } as never)
      .mockResolvedValueOnce({ created: false } as never);
    const result = await importAmazonDocs("user-1", [book("a"), book("b"), book("c")]);
    expect(result.sharedBookIds).toEqual(["shared-1"]);
  });
});
