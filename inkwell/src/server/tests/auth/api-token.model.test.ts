import { beforeEach, describe, expect, it, vi } from "vitest";

// A fake Prisma client that records every call.
type Args = { where?: Record<string, unknown>; data?: Record<string, unknown>; [key: string]: unknown };
const calls: { method: string; args: Args }[] = [];

vi.mock("@/server/db", () => ({
  prisma: {
    apiToken: new Proxy(
      {},
      {
        get: (_target, method: string) =>
          vi.fn(async (args: Args) => {
            calls.push({ method, args });
            return null;
          }),
      },
    ),
  },
}));

const model = await import("@/server/auth/api-token.model");
const USER = "user-1";

beforeEach(() => {
  calls.length = 0;
});

describe("user-scoped token queries", () => {
  it("creates the token for the given user", async () => {
    await model.createApiToken({ userId: USER, name: "Laptop", tokenHash: "h", prefix: "ink_abcdef" });
    expect(calls).toEqual([
      { method: "create", args: { data: { userId: USER, name: "Laptop", tokenHash: "h", prefix: "ink_abcdef" } } },
    ]);
  });

  it("lists only the user's unrevoked tokens, never their hashes", async () => {
    await model.listActiveApiTokens(USER);
    const { where, select } = calls[0].args;
    expect(where).toEqual({ userId: USER, revokedAt: null });
    expect(select).not.toHaveProperty("tokenHash");
    expect(calls[0].args.orderBy).toEqual({ createdAt: "desc" });
  });

  it("revokes only the user's own, still-active token", async () => {
    await model.revokeApiToken(USER, "tok-1");
    expect(calls[0].method).toBe("updateMany");
    expect(calls[0].args.where).toEqual({ id: "tok-1", userId: USER, revokedAt: null });
    expect(calls[0].args.data).toEqual({ revokedAt: expect.any(Date) });
  });
});

// These run before the user is known: the hash is the credential.
describe("token lookups by credential", () => {
  it("finds a token by its hash, with its user", async () => {
    await model.findApiTokenByHash("h");
    expect(calls[0]).toEqual({ method: "findUnique", args: { where: { tokenHash: "h" }, include: { user: true } } });
  });

  it("records when a token was last used", async () => {
    await model.touchApiToken("tok-1");
    expect(calls[0].method).toBe("update");
    expect(calls[0].args).toEqual({ where: { id: "tok-1" }, data: { lastUsedAt: expect.any(Date) } });
  });
});

describe("transactions", () => {
  it("uses the db passed in", async () => {
    const create = vi.fn();
    await model.createApiToken({ userId: USER, name: "x", tokenHash: "h", prefix: "p" }, { apiToken: { create } } as never);
    expect(create).toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });
});
