import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "@/server/metadata/http";
import { openLibrary, parseIsbnResponse, parseSearchResponse } from "@/server/metadata/open-library.provider";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/metadata/${name}`, import.meta.url), "utf8"));

const DUNE = "9780441013593";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("parseIsbnResponse", () => {
  it("reads a real edition", () => {
    expect(parseIsbnResponse(fixture("open-library-isbn.json"), DUNE)).toEqual({
      source: "OPEN_LIBRARY",
      sourceId: "OL62694654M",
      title: "Dune",
      subtitle: undefined,
      authors: ["Frank Herbert"],
      isbn13: DUNE,
      isbn10: undefined,
      coverUrl: "https://covers.openlibrary.org/b/id/15265842-M.jpg",
      pageCount: 896,
      publishedYear: 2005,
    });
  });

  it("returns null for a miss", () => {
    expect(parseIsbnResponse(fixture("open-library-isbn-miss.json"), DUNE)).toBeNull();
  });

  it("returns null for a record under another ISBN", () => {
    expect(parseIsbnResponse(fixture("open-library-isbn.json"), "9780000000002")).toBeNull();
  });

  it.each([
    ["no title", { key: "/books/OL1M" }],
    ["no key", { title: "Dune" }],
    ["a bad key", { key: "/books/../../x y", title: "Dune" }],
    ["a string", "Dune"],
  ])("returns null for a record with %s", (_label, record) => {
    expect(parseIsbnResponse({ [`ISBN:${DUNE}`]: record }, DUNE)).toBeNull();
  });

  it("drops bad fields but keeps the book", () => {
    const book = parseIsbnResponse(
      {
        [`ISBN:${DUNE}`]: {
          key: "/books/OL1M",
          title: "Dune",
          authors: "Frank Herbert",
          number_of_pages: "lots",
          cover: { medium: "https://evil.example/x.jpg" },
          identifiers: "nope",
        },
      },
      DUNE,
    );
    expect(book).toMatchObject({ title: "Dune", authors: [], pageCount: undefined, coverUrl: undefined });
  });

  it.each([[null], [[]], ["junk"], [42]])("returns null for %j", (json) => {
    expect(parseIsbnResponse(json, DUNE)).toBeNull();
  });
});

describe("parseSearchResponse", () => {
  it("reads real search results, one per work", () => {
    const results = parseSearchResponse(fixture("open-library-search.json"), 10);
    expect(results.map((book) => book.title)).toEqual(["Dune", "Dune Messiah", "Children of Dune"]);
    expect(results[0]).toEqual({
      source: "OPEN_LIBRARY",
      sourceId: "OL893414W",
      title: "Dune",
      subtitle: undefined,
      authors: ["Frank Herbert"],
      isbn13: "9780425043769",
      coverUrl: "https://covers.openlibrary.org/b/id/11481354-M.jpg",
      pageCount: 608,
      publishedYear: 1965,
    });
  });

  it("turns an ISBN-10 into an ISBN-13 when a work has no ISBN-13", () => {
    const [book] = parseSearchResponse({ docs: [{ key: "/works/OL1W", title: "X", isbn: ["0441013597"] }] }, 10);
    expect(book.isbn13).toBe(DUNE);
  });

  it("stops at the limit and skips unusable docs", () => {
    const docs = [{ key: "/works/OL1W" }, ...Array.from({ length: 5 }, (_, i) => ({ key: `/works/OL${i}W`, title: `T${i}` }))];
    expect(parseSearchResponse({ docs }, 3).map((book) => book.title)).toEqual(["T0", "T1", "T2"]);
  });

  it.each([[{}], [{ docs: "x" }], [null]])("returns nothing for %j", (json) => {
    expect(parseSearchResponse(json, 10)).toEqual([]);
  });
});

describe("requests", () => {
  const respond = (body: unknown, init: ResponseInit = {}) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), init));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  it("names the app in the User-Agent and caches for a day", async () => {
    vi.stubEnv("METADATA_USER_AGENT", "Inkwell/1.0 (test)");
    const fetchMock = respond(fixture("open-library-isbn.json"));
    await openLibrary.lookupIsbn(DUNE);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { next: unknown }];
    expect(url).toBe(`https://openlibrary.org/api/books?bibkeys=ISBN%3A${DUNE}&format=json&jscmd=data`);
    expect(init.headers).toMatchObject({ "User-Agent": "Inkwell/1.0 (test)" });
    expect(init.next).toEqual({ revalidate: 86_400 });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("encodes the search query", async () => {
    const fetchMock = respond({ docs: [] });
    await openLibrary.search("dune & herbert", 10);
    expect(String(fetchMock.mock.calls[0]?.[0 as never])).toContain("q=dune+%26+herbert");
  });

  it("throws ProviderError on a bad status, bad JSON or a network error", async () => {
    respond({}, { status: 503 });
    await expect(openLibrary.lookupIsbn(DUNE)).rejects.toThrow(ProviderError);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>")));
    await expect(openLibrary.lookupIsbn(DUNE)).rejects.toThrow("invalid JSON");

    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(openLibrary.lookupIsbn(DUNE)).rejects.toThrow("request failed");
  });

  it("reports a timeout", async () => {
    const timeout = new DOMException("The operation timed out.", "TimeoutError");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(timeout)));
    await expect(openLibrary.lookupIsbn(DUNE)).rejects.toThrow("timed out");
  });

  it("refuses an oversized response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`"${"a".repeat(1_000_001)}"`)));
    await expect(openLibrary.lookupIsbn(DUNE)).rejects.toThrow("too large");
  });
});
