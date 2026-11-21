import { beforeEach, describe, expect, it, vi } from "vitest";

const user = { upsert: vi.fn(), findUnique: vi.fn() };
vi.mock("@/server/db", () => ({ prisma: { user } }));

const model = await import("@/server/auth/user.model");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("upsertUser", () => {
  it("creates or updates the user by their own id", async () => {
    await model.upsertUser({ id: "user-1", email: "reader@example.com", name: "Reader", photoUrl: "p.png" });
    expect(user.upsert).toHaveBeenCalledWith({
      where: { id: "user-1" },
      create: { id: "user-1", email: "reader@example.com", name: "Reader", photoUrl: "p.png" },
      update: { email: "reader@example.com", photoUrl: "p.png" },
    });
  });

  it("never overwrites a name on sign-in", async () => {
    await model.upsertUser({ id: "user-1", email: "reader@example.com", name: "Google name" });
    expect(user.upsert.mock.calls[0][0].update).not.toHaveProperty("name");
  });
});

describe("findUserById", () => {
  it("looks the user up by id", async () => {
    await model.findUserById("user-1");
    expect(user.findUnique).toHaveBeenCalledWith({ where: { id: "user-1" } });
  });
});
