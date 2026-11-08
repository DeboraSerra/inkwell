import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError, ValidationError } from "@/server/errors";
import * as apiTokenModel from "@/server/auth/api-token.model";
import * as userModel from "@/server/auth/user.model";

vi.mock("@/server/auth/api-token.model");
vi.mock("@/server/auth/user.model");
const adminAuth = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  createSessionCookie: vi.fn(),
  verifySessionCookie: vi.fn(),
}));
vi.mock("@/config/firebase-admin", () => ({ adminAuth }));

const service = await import("@/server/auth/auth.service");
const tokens = vi.mocked(apiTokenModel);
const users = vi.mocked(userModel);

const USER = { id: "user-1", email: "reader@example.test", name: null, age: null, createdAt: new Date(), updatedAt: new Date() };
const nowSeconds = () => Math.floor(Date.now() / 1000);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("createSession", () => {
  it("creates the user and returns a session cookie for a fresh sign-in", async () => {
    adminAuth.verifyIdToken.mockResolvedValue({ uid: "user-1", email: USER.email, auth_time: nowSeconds() });
    adminAuth.createSessionCookie.mockResolvedValue("session-cookie");
    await expect(service.createSession("id-token")).resolves.toBe("session-cookie");
    expect(users.upsertUser).toHaveBeenCalledWith({ id: "user-1", email: USER.email, name: undefined });
  });

  it("rejects a sign-in older than five minutes", async () => {
    adminAuth.verifyIdToken.mockResolvedValue({ uid: "user-1", email: USER.email, auth_time: nowSeconds() - 600 });
    await expect(service.createSession("id-token")).rejects.toThrow(UnauthorizedError);
    expect(adminAuth.createSessionCookie).not.toHaveBeenCalled();
  });

  it("rejects an invalid ID token", async () => {
    adminAuth.verifyIdToken.mockRejectedValue(new Error("bad token"));
    await expect(service.createSession("id-token")).rejects.toThrow(UnauthorizedError);
  });
});

describe("createApiToken", () => {
  it("stores only the hash and a short prefix, and returns the plain token", async () => {
    const token = await service.createApiToken("user-1", "  Chrome extension ");
    expect(token).toMatch(/^ink_[\w-]{43}$/);
    const stored = tokens.createApiToken.mock.calls[0][0];
    expect(stored).toMatchObject({ userId: "user-1", name: "Chrome extension", prefix: token.slice(0, 10) });
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.tokenHash).not.toContain(token);
  });

  it.each(["", "   ", "x".repeat(101)])("rejects the name %j", async (name) => {
    await expect(service.createApiToken("user-1", name)).rejects.toThrow(ValidationError);
    expect(tokens.createApiToken).not.toHaveBeenCalled();
  });
});

describe("getUserFromApiToken", () => {
  it("returns the user and records the use", async () => {
    tokens.findApiTokenByHash.mockResolvedValue({ id: "t1", revokedAt: null, user: USER } as never);
    await expect(service.getUserFromApiToken("ink_abc")).resolves.toBe(USER);
    expect(tokens.touchApiToken).toHaveBeenCalledWith("t1");
  });

  it("rejects revoked, unknown and malformed tokens", async () => {
    tokens.findApiTokenByHash.mockResolvedValueOnce({ id: "t1", revokedAt: new Date(), user: USER } as never);
    await expect(service.getUserFromApiToken("ink_revoked")).resolves.toBeNull();
    await expect(service.getUserFromApiToken("ink_unknown")).resolves.toBeNull();
    await expect(service.getUserFromApiToken("not-a-token")).resolves.toBeNull();
    expect(tokens.touchApiToken).not.toHaveBeenCalled();
  });
});
