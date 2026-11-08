import { beforeEach, describe, expect, it, vi } from "vitest";
import { findOrCreateAmazonBook } from "@/server/books/book.service";
import { addBookToLibrary } from "@/server/library/library.service";

vi.mock("@/server/books/book.service");
vi.mock("@/server/library/library.service");
vi.mock("@/server/db", () => ({ transaction: (fn: (tx: unknown) => unknown) => fn("tx") }));

const { importAmazonBooks } = await import("@/server/imports/imports.service");
const book = (title: string) => ({ title, authors: ["A"] });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(findOrCreateAmazonBook).mockResolvedValue({ id: "b1" } as never);
});

describe("importAmazonBooks", () => {
  it("adds each book as an ebook for this user and counts new and existing", async () => {
    vi.mocked(addBookToLibrary)
      .mockResolvedValueOnce({ created: true } as never)
      .mockResolvedValueOnce({ created: false } as never);
    await expect(importAmazonBooks("user-1", [book("x"), book("y")])).resolves.toEqual({ created: 1, existing: 1 });
    expect(addBookToLibrary).toHaveBeenCalledWith(
      "user-1",
      { bookId: "b1", formats: ["EBOOK"], source: "AMAZON_IMPORT" },
      "tx",
    );
  });

  it("does nothing for an empty list", async () => {
    await expect(importAmazonBooks("user-1", [])).resolves.toEqual({ created: 0, existing: 0 });
    expect(addBookToLibrary).not.toHaveBeenCalled();
  });
});
