import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRequestUser } from "@/server/auth/auth.guard";
import { NotFoundError } from "@/server/errors";
import { importAmazonBooks } from "@/server/imports/imports.service";

vi.mock("@/server/auth/auth.guard");
vi.mock("@/server/imports/imports.service");

const { POST } = await import("@/app/api/imports/amazon/route");
const post = (body: string) => new Request("http://app.test/api/imports/amazon", { method: "POST", body });
const good = JSON.stringify({ books: [{ title: "x", authors: "y" }, { title: "" }] });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getRequestUser).mockResolvedValue({ id: "user-1" } as never);
});

describe("POST /api/imports/amazon", () => {
  it("imports for the authenticated user and reports the counts", async () => {
    vi.mocked(importAmazonBooks).mockResolvedValue({ created: 1, existing: 0 });
    const response = await POST(post(good));
    await expect(response.json()).resolves.toEqual({ created: 1, existing: 0, skipped: 1 });
    expect(importAmazonBooks).toHaveBeenCalledWith("user-1", [expect.objectContaining({ title: "x" })]);
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
