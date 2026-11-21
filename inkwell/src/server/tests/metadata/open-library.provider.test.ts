import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "@/server/metadata/http";
import {
  openLibrary,
  parseEditionWork,
  parseIsbnResponse,
  parseSearchResponse,
  parseWorkDescription,
  searchQueryForId,
} from "@/server/metadata/open-library.provider";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../fixtures/metadata/${name}`, import.meta.url), "utf8"));

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

describe("lookupId", () => {
  it.each([
    ["OL45W", "key:/works/OL45W"],
    ["OL123M", "edition_key:OL123M"],
  ])("finds %s through search", (id, query) => {
    expect(searchQueryForId(id)).toBe(query);
  });

  it.each(["", "OL45", "OL45A", "ol45w", "OL45W OR x", "../OL45W", "OL1234567890123W"])(
    "refuses %j without a request",
    async (id) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      expect(searchQueryForId(id)).toBeNull();
      await expect(openLibrary.lookupId(id)).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("asks for one record by its key and reads it like a search result", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(fixture("open-library-search.json"))));
    vi.stubGlobal("fetch", fetchMock);
    const book = await openLibrary.lookupId("OL45W");
    expect(String(fetchMock.mock.calls[0]?.[0 as never])).toContain("q=key%3A%2Fworks%2FOL45W");
    expect(String(fetchMock.mock.calls[0]?.[0 as never])).toContain("limit=1");
    expect(book).toMatchObject({ source: "OPEN_LIBRARY" });
  });

  it("is null when nothing has that key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ docs: [] }))));
    await expect(openLibrary.lookupId("OL45W")).resolves.toBeNull();
  });
});

// Shaped like the live answer for "the midnight library": the work's ISBN list
// starts with a Turkish edition, and `editions` holds the English one.
describe("parseSearchResponse with a matched edition", () => {
  const work = (editions: unknown) => ({
    docs: [
      {
        key: "/works/OL20965973W",
        title: "The Midnight Library",
        author_name: ["Matt Haig"],
        isbn: ["9786051981833", "9781101949443"],
        cover_i: 111,
        number_of_pages_median: 304,
        first_publish_year: 2020,
        editions,
      },
    ],
  });
  const english = {
    key: "/books/OL61174737M",
    title: "The Midnight Library",
    cover_i: 15164860,
    isbn: ["0525559477", "9781101949443"],
  };

  it("uses the edition the search matched: its key, ISBN and cover", () => {
    const [book] = parseSearchResponse(work({ docs: [english] }), 10);
    expect(book).toEqual({
      source: "OPEN_LIBRARY",
      sourceId: "OL61174737M",
      title: "The Midnight Library",
      subtitle: undefined,
      authors: ["Matt Haig"],
      isbn13: "9781101949443",
      coverUrl: "https://covers.openlibrary.org/b/id/15164860-M.jpg",
      pageCount: 304,
      publishedYear: 2020,
    });
  });

  it("converts the edition's ISBN-10 when it has no ISBN-13", () => {
    const [book] = parseSearchResponse(work({ docs: [{ ...english, isbn: ["0525559477"] }] }), 10);
    expect(book.isbn13).toBe("9780525559474");
  });

  it("never takes another edition's ISBN when the matched one has none", () => {
    const [book] = parseSearchResponse(work({ docs: [{ ...english, isbn: [] }] }), 10);
    expect(book.isbn13).toBeUndefined();
    expect(book.sourceId).toBe("OL61174737M");
  });

  it("keeps the work's cover when the edition has none", () => {
    const [book] = parseSearchResponse(work({ docs: [{ ...english, cover_i: undefined }] }), 10);
    expect(book.coverUrl).toBe("https://covers.openlibrary.org/b/id/111-M.jpg");
  });

  it.each([
    ["no editions field", undefined],
    ["an empty one", { docs: [] }],
    ["a malformed one", "nonsense"],
  ])("falls back to the work with %s", (_label, editions) => {
    const [book] = parseSearchResponse(work(editions), 10);
    expect(book).toMatchObject({ sourceId: "OL20965973W", isbn13: "9786051981833" });
  });

  it("asks for the matched edition's fields", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ docs: [] })));
    vi.stubGlobal("fetch", fetchMock);
    await openLibrary.search("the midnight library", 10);
    const fields = new URL(String(fetchMock.mock.calls[0]?.[0 as never])).searchParams.get("fields") ?? "";
    expect(fields.split(",")).toEqual(expect.arrayContaining(["editions", "editions.key", "editions.isbn", "editions.cover_i"]));
  });
});

describe("fetchDescription", () => {
  const respondWith = (bodies: Record<string, unknown>) => {
    const fetchMock = vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      return path in bodies ? new Response(JSON.stringify(bodies[path])) : new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  it.each([
    ["a string", "A library between life and death."],
    ["a text object", { type: "/type/text", value: "A library between life and death." }],
  ])("reads the work's synopsis as %s", (_label, description) => {
    expect(parseWorkDescription({ description })).toBe("A library between life and death.");
  });

  it.each([
    ["no description", {}],
    ["a number", { description: 42 }],
    ["an object with no value", { description: { type: "/type/text" } }],
    ["not an object", "nope"],
  ])("has none for %s", (_label, json) => {
    expect(parseWorkDescription(json)).toBeUndefined();
  });

  it("strips HTML from the synopsis", () => {
    expect(parseWorkDescription({ description: "<p>Between <b>life</b> and death.</p>" })).toBe("Between life and death.");
  });

  it("reads an edition's work, and only a work key", () => {
    expect(parseEditionWork({ works: [{ key: "/works/OL20965973W" }] })).toBe("OL20965973W");
    expect(parseEditionWork({ works: [{ key: "/books/OL1M" }] })).toBeUndefined();
    expect(parseEditionWork({ works: [] })).toBeUndefined();
    expect(parseEditionWork(null)).toBeUndefined();
  });

  it("fetches a work's synopsis directly", async () => {
    const fetchMock = respondWith({ "/works/OL20965973W.json": { description: "Between life and death." } });
    await expect(openLibrary.fetchDescription?.("OL20965973W")).resolves.toBe("Between life and death.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("goes from an edition to its work", async () => {
    const fetchMock = respondWith({
      "/books/OL61174737M.json": { works: [{ key: "/works/OL20965973W" }] },
      "/works/OL20965973W.json": { description: { value: "Between life and death." } },
    });
    await expect(openLibrary.fetchDescription?.("OL61174737M")).resolves.toBe("Between life and death.");
    expect(fetchMock.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      "/books/OL61174737M.json",
      "/works/OL20965973W.json",
    ]);
  });

  it("uses the edition's own synopsis without asking its work", async () => {
    const fetchMock = respondWith({
      "/books/OL62430938M.json": {
        description: { type: "/type/text", value: "A dark, gothic fantasy." },
        works: [{ key: "/works/OL45882131W" }],
      },
      "/works/OL45882131W.json": { title: "Alchemised" },
    });
    await expect(openLibrary.fetchDescription?.("OL62430938M")).resolves.toBe("A dark, gothic fantasy.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("has none when neither the edition nor its work has one", async () => {
    respondWith({
      "/books/OL62430938M.json": { works: [{ key: "/works/OL45882131W" }] },
      "/works/OL45882131W.json": { title: "Alchemised" },
    });
    await expect(openLibrary.fetchDescription?.("OL62430938M")).resolves.toBeUndefined();
  });

  it("stops when the edition names no work", async () => {
    const fetchMock = respondWith({ "/books/OL61174737M.json": { works: [] } });
    await expect(openLibrary.fetchDescription?.("OL61174737M")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["", "OL45", "../OL45W", "OL45W/../x", "ol45w"])("refuses %j without a request", async (id) => {
    const fetchMock = respondWith({});
    await expect(openLibrary.fetchDescription?.(id)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
