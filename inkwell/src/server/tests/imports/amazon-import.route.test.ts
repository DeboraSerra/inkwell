import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRequestUser } from "@/server/auth/auth.guard";
import { NotFoundError } from "@/server/errors";
import { enrichImportedBooks } from "@/server/enrichment/enrichment.service";
import { importAmazonBooks } from "@/server/imports/imports.service";

// `after` needs a live request; here it just records what's scheduled.
const scheduled = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => scheduled.push(task),
}));
vi.mock("@/server/auth/auth.guard");
vi.mock("@/server/enrichment/enrichment.service");
vi.mock("@/server/imports/imports.service");

const { POST } = await import("@/app/api/imports/amazon/route");
const post = (body: string) => new Request("http://app.test/api/imports/amazon", { method: "POST", body });
const good = JSON.stringify({ books: [{ title: "x", authors: "y" }, { title: "" }] });

beforeEach(() => {
  scheduled.length = 0;
  vi.resetAllMocks();
  vi.mocked(getRequestUser).mockResolvedValue({ id: "user-1" } as never);
});

describe("POST /api/imports/amazon", () => {
  it("imports for the authenticated user and reports the counts", async () => {
    vi.mocked(importAmazonBooks).mockResolvedValue({ created: 1, existing: 0, sharedBookIds: ["b1"] });
    const response = await POST(post(good));
    await expect(response.json()).resolves.toEqual({ created: 1, existing: 0, skipped: 1 });
    expect(importAmazonBooks).toHaveBeenCalledWith("user-1", [expect.objectContaining({ title: "x" })]);
  });

  it("sends the new shared books for enrichment after the response, never in it", async () => {
    vi.mocked(importAmazonBooks).mockResolvedValue({ created: 1, existing: 0, sharedBookIds: ["b1"] });
    await POST(post(good));
    expect(enrichImportedBooks).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    await scheduled[0]();
    expect(enrichImportedBooks).toHaveBeenCalledWith(["b1"]);
  });

  it("rejects a missing or bad token before reading anything", async () => {
    vi.mocked(getRequestUser).mockResolvedValue(null);
    expect((await POST(post(good))).status).toBe(401);
    expect(importAmazonBooks).not.toHaveBeenCalled();
  });

  it.each([
    ["bad JSON", "{", 400],
    ["a wrong shape", "[]", 400],
    ["too large a body", " ".repeat(1_000_001), 413],
  ])("rejects %s", async (_name, body, status) => {
    expect((await POST(post(body))).status).toBe(status);
    expect(importAmazonBooks).not.toHaveBeenCalled();
  });

  it("maps domain errors and rethrows anything else", async () => {
    vi.mocked(importAmazonBooks).mockRejectedValueOnce(new NotFoundError("Gone"));
    expect((await POST(post(good))).status).toBe(404);
    vi.mocked(importAmazonBooks).mockRejectedValueOnce(new Error("bug"));
    await expect(POST(post(good))).rejects.toThrow("bug");
  });
});
