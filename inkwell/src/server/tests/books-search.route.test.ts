import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRequestUser } from "@/server/auth/auth.guard";
import { RateLimitError } from "@/server/errors";
import { searchForLibrary } from "@/server/library/library.service";
import { consumeRateLimit } from "@/server/rate-limit/rate-limit.service";

vi.mock("@/server/auth/auth.guard");
vi.mock("@/server/library/library.service");
vi.mock("@/server/rate-limit/rate-limit.service");

const { GET } = await import("@/app/api/books/search/route");
const get = (q?: string) =>
  new Request(`http://app.test/api/books/search${q === undefined ? "" : `?${new URLSearchParams({ q })}`}`);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getRequestUser).mockResolvedValue({ id: "user-1" } as never);
});

describe("GET /api/books/search", () => {
  it("searches for the signed-in user with the cleaned query, counting toward the limit", async () => {
    const results = [{ source: "GOOGLE_BOOKS", sourceId: "g1", title: "Dune", authors: [] }];
    vi.mocked(searchForLibrary).mockResolvedValue(results as never);
    const response = await GET(get("  dune   herbert "));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ results });
    expect(consumeRateLimit).toHaveBeenCalledWith("user-1", "BOOK_SEARCH");
    expect(searchForLibrary).toHaveBeenCalledWith("user-1", "dune herbert");
  });

  it("rejects a missing or bad token before anything else", async () => {
    vi.mocked(getRequestUser).mockResolvedValue(null);
    expect((await GET(get("dune"))).status).toBe(401);
    expect(consumeRateLimit).not.toHaveBeenCalled();
    expect(searchForLibrary).not.toHaveBeenCalled();
  });

  it.each([
    ["no query", undefined],
    ["a short query", "du"],
    ["only spaces", "      "],
    ["a long query", "x".repeat(201)],
  ])("rejects %s with a 400, without counting it", async (_label, q) => {
    const response = await GET(get(q));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: expect.any(String) });
    expect(consumeRateLimit).not.toHaveBeenCalled();
    expect(searchForLibrary).not.toHaveBeenCalled();
  });

  it("answers 429 with Retry-After past the limit", async () => {
    vi.mocked(consumeRateLimit).mockRejectedValue(new RateLimitError(20));
    const response = await GET(get("dune"));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("20");
    expect(searchForLibrary).not.toHaveBeenCalled();
  });

  it("rethrows anything unexpected", async () => {
    vi.mocked(searchForLibrary).mockRejectedValue(new Error("bug"));
    await expect(GET(get("dune"))).rejects.toThrow("bug");
  });
});
