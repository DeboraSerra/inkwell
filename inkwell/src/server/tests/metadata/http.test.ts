import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderError, fetchProviderJson } from "@/server/metadata/http";

const URL_WITH_KEY = "https://books.example/v1?q=dune&key=SECRET-KEY";

const stubFetch = (impl: (...args: Parameters<typeof fetch>) => Promise<Response>) => {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};
const failure = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected a failure");
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchProviderJson", () => {
  it("returns the parsed JSON", async () => {
    stubFetch(async () => Response.json({ items: [1] }));
    await expect(fetchProviderJson("Google Books", URL_WITH_KEY)).resolves.toEqual({ items: [1] });
  });

  it("asks for JSON with a timeout and a day-long cache, keeping extra headers", async () => {
    const fetchMock = stubFetch(async () => Response.json({}));
    await fetchProviderJson("Open Library", URL_WITH_KEY, { "User-Agent": "Inkwell" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(URL_WITH_KEY);
    expect(init?.headers).toEqual({ Accept: "application/json", "User-Agent": "Inkwell" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect((init as RequestInit & { next?: unknown }).next).toEqual({ revalidate: 86_400 });
  });

  it("reports a timeout", async () => {
    stubFetch(async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    const error = await failure(() => fetchProviderJson("Open Library", URL_WITH_KEY));
    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ provider: "Open Library", message: "Open Library: timed out" });
  });

  it("reports a network failure", async () => {
    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(fetchProviderJson("Open Library", URL_WITH_KEY)).rejects.toThrow("Open Library: request failed");
  });

  // AbortSignal.timeout runs on Node's own timers, which fake timers can't advance.
  it("gives up after 5 seconds", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = stubFetch(async () => Response.json({}));
    await fetchProviderJson("Open Library", URL_WITH_KEY);
    expect(timeout).toHaveBeenCalledWith(5000);
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(timeout.mock.results[0].value);
    timeout.mockRestore();
  });

  it.each([404, 429, 500])("reports status %i", async (status) => {
    stubFetch(async () => new Response("nope", { status }));
    await expect(fetchProviderJson("Google Books", URL_WITH_KEY)).rejects.toThrow(`Google Books: status ${status}`);
  });

  it("refuses a response declared larger than 1 MB without reading it", async () => {
    const response = new Response("{}", { headers: { "content-length": "1000001" } });
    const read = vi.spyOn(response, "text");
    stubFetch(async () => response);
    await expect(fetchProviderJson("Google Books", URL_WITH_KEY)).rejects.toThrow("response too large");
    expect(read).not.toHaveBeenCalled();
  });

  it("refuses a body larger than 1 MB even without a declared length", async () => {
    stubFetch(async () => new Response(`"${"x".repeat(1_000_000)}"`));
    await expect(fetchProviderJson("Google Books", URL_WITH_KEY)).rejects.toThrow("response too large");
  });

  it("accepts a body of exactly 1 MB", async () => {
    const body = `"${"x".repeat(999_998)}"`;
    stubFetch(async () => new Response(body));
    await expect(fetchProviderJson("Google Books", URL_WITH_KEY)).resolves.toHaveLength(999_998);
  });

  it("reports invalid JSON", async () => {
    stubFetch(async () => new Response("<html>oops</html>"));
    await expect(fetchProviderJson("Open Library", URL_WITH_KEY)).rejects.toThrow("Open Library: invalid JSON");
  });

  it.each([
    ["a timeout", () => Promise.reject(new DOMException("t", "TimeoutError"))],
    ["a bad status", () => Promise.resolve(new Response("", { status: 403 }))],
    ["invalid JSON", () => Promise.resolve(new Response("nope"))],
  ])("never puts the URL or its key in the error on %s", async (_label, impl) => {
    stubFetch(impl);
    const error = await failure(() => fetchProviderJson("Google Books", URL_WITH_KEY));
    expect(String((error as Error).message)).not.toContain("SECRET-KEY");
    expect(String((error as Error).message)).not.toContain("books.example");
  });
});
