import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { googleBooks, parseIsbnResponse, parseVolumes } from "@/server/metadata/google-books.provider";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/metadata/${name}`, import.meta.url), "utf8"));

const DUNE = "9780441013593";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("parseIsbnResponse", () => {
  it("picks the volume carrying the ISBN, not the loose match", () => {
    expect(parseIsbnResponse(fixture("google-books-isbn.json"), DUNE)).toEqual({
      source: "GOOGLE_BOOKS",
      sourceId: "B1hSG45JCX4C",
      title: "Dune",
      subtitle: undefined,
      authors: ["Frank Herbert"],
      isbn13: DUNE,
      isbn10: "0441013597",
      coverUrl:
        "https://books.google.com/books/content?id=B1hSG45JCX4C&printsec=frontcover&img=1&zoom=1&source=gbs_api",
      pageCount: 528,
      publishedYear: 2005,
      description: "Set on the desert planet Arrakis , a story of politics & ecology. Second paragraph.",
    });
  });

  it("returns null when no volume carries the ISBN", () => {
    expect(parseIsbnResponse(fixture("google-books-isbn.json"), "9780000000002")).toBeNull();
  });

  it("returns null for an empty result", () => {
    expect(parseIsbnResponse(fixture("google-books-empty.json"), DUNE)).toBeNull();
  });
});

describe("parseVolumes", () => {
  it("skips unusable items and respects the limit", () => {
    const items = [
      { id: "bad id!", volumeInfo: { title: "X" } },
      { id: "a1", volumeInfo: {} },
      { id: "a2", volumeInfo: { title: "One" } },
      { id: "a3", volumeInfo: { title: "Two" } },
      "junk",
    ];
    expect(parseVolumes({ items }, 1).map((book) => book.title)).toEqual(["One"]);
  });

  it.each([[null], [{ items: "x" }], [fixture("google-books-quota-error.json")]])("returns nothing for %j", (json) => {
    expect(parseVolumes(json, 10)).toEqual([]);
  });
});

describe("requests", () => {
  it("sends the API key when one is configured", async () => {
    vi.stubEnv("GOOGLE_BOOKS_API_KEY", "test-key");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(fixture("google-books-isbn.json"))));
    vi.stubGlobal("fetch", fetchMock);
    await googleBooks.lookupIsbn(DUNE);
    expect(String(fetchMock.mock.calls[0]?.[0 as never])).toBe(
      `https://www.googleapis.com/books/v1/volumes?q=isbn%3A${DUNE}&key=test-key`,
    );
  });

  it("works without a key", async () => {
    vi.stubEnv("GOOGLE_BOOKS_API_KEY", "");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ totalItems: 0 })));
    vi.stubGlobal("fetch", fetchMock);
    await googleBooks.search("dune", 10);
    expect(String(fetchMock.mock.calls[0]?.[0 as never])).toBe(
      "https://www.googleapis.com/books/v1/volumes?q=dune&maxResults=10&printType=books",
    );
  });

  it("never puts the key in the error when the quota runs out", async () => {
    vi.stubEnv("GOOGLE_BOOKS_API_KEY", "secret-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(fixture("google-books-quota-error.json")), { status: 429 })),
    );
    const error = await googleBooks.lookupIsbn(DUNE).catch((e: unknown) => e);
    expect(String(error)).toContain("status 429");
    expect(String(error)).not.toContain("secret-key");
  });
});
