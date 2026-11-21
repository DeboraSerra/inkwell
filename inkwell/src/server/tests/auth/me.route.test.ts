import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRequestUser } from "@/server/auth/auth.guard";

vi.mock("@/server/auth/auth.guard");

const { GET } = await import("@/app/api/me/route");
const get = () => new Request("http://app.test/api/me", { headers: { authorization: "Bearer ink_abc" } });

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/me", () => {
  it("returns only the user's id, email and name", async () => {
    vi.mocked(getRequestUser).mockResolvedValue({
      id: "user-1",
      email: "reader@example.com",
      name: "Reader",
      photoUrl: "https://example.com/me.png",
      createdAt: new Date(),
    } as never);
    const response = await GET(get());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: "user-1", email: "reader@example.com", name: "Reader" });
  });

  it("returns 401 without a valid token or session", async () => {
    vi.mocked(getRequestUser).mockResolvedValue(null);
    const response = await GET(get());
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });
});
