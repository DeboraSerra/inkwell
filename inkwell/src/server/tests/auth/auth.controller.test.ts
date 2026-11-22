import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { clearSessionCookie, requireUser, setSessionCookie } from "@/server/auth/auth.guard";
import * as authService from "@/server/auth/auth.service";
import { UnauthorizedError, ValidationError } from "@/server/errors";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The real redirect throws to end the action; so does this one.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect ${path}`);
  }),
}));
vi.mock("@/server/auth/auth.guard");
vi.mock("@/server/auth/auth.service");

const { createApiToken, revokeApiToken, signIn, signOut } = await import("@/server/auth/auth.controller");
const service = vi.mocked(authService);

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ id: "user-1" } as never);
  service.createSession.mockResolvedValue("session-cookie");
});

describe("signIn", () => {
  it("sets the session cookie and redirects to the next page", async () => {
    await expect(signIn("id-token", "/books/shelves?shelf=tbr")).rejects.toThrow("redirect /books/shelves?shelf=tbr");
    expect(service.createSession).toHaveBeenCalledWith("id-token");
    expect(setSessionCookie).toHaveBeenCalledWith("session-cookie");
  });

  it.each([
    ["no next page", undefined],
    ["an absolute URL", "https://evil.example/phish"],
    ["a protocol-relative URL", "//evil.example"],
    ["a path without a leading slash", "books"],
    ["a non-string", 42 as never],
  ])("redirects home for %s", async (_label, next) => {
    await expect(signIn("id-token", next)).rejects.toThrow(/^redirect \/$/);
  });

  it.each([
    ["a non-string token", 123 as never],
    ["an oversized token", "x".repeat(4097)],
  ])("refuses %s before touching Firebase", async (_label, token) => {
    await expect(signIn(token)).resolves.toEqual({ error: "Invalid sign-in request." });
    expect(service.createSession).not.toHaveBeenCalled();
  });

  it("returns a message and sets no cookie when the session can't be created", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    service.createSession.mockRejectedValue(new UnauthorizedError("Recent sign-in required"));
    await expect(signIn("id-token", "/settings")).resolves.toEqual({
      error: "Couldn't sign you in. Please try again.",
    });
    expect(setSessionCookie).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe("signOut", () => {
  it("clears the cookie and redirects to /login", async () => {
    await expect(signOut()).rejects.toThrow("redirect /login");
    expect(clearSessionCookie).toHaveBeenCalled();
  });
});

describe("createApiToken", () => {
  it("creates a token for the signed-in user and returns it once", async () => {
    service.createApiToken.mockResolvedValue("ink_secret");
    await expect(createApiToken({}, form({ name: "Laptop", userId: "someone-else" }))).resolves.toEqual({
      token: "ink_secret",
    });
    expect(service.createApiToken).toHaveBeenCalledWith("user-1", "Laptop");
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("passes an empty name when the field is missing", async () => {
    service.createApiToken.mockRejectedValue(new ValidationError("Give the token a name."));
    await expect(createApiToken({}, form({}))).resolves.toEqual({ error: "Give the token a name." });
    expect(service.createApiToken).toHaveBeenCalledWith("user-1", "");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rethrows unexpected errors", async () => {
    service.createApiToken.mockRejectedValue(new Error("db down"));
    await expect(createApiToken({}, form({ name: "Laptop" }))).rejects.toThrow("db down");
  });

  it("requires a signed-in user", async () => {
    vi.mocked(requireUser).mockRejectedValue(new Error("redirect /login"));
    await expect(createApiToken({}, form({ name: "Laptop" }))).rejects.toThrow("redirect /login");
    expect(service.createApiToken).not.toHaveBeenCalled();
  });
});

describe("revokeApiToken", () => {
  it("revokes the token for the signed-in user", async () => {
    await revokeApiToken(form({ tokenId: "tok-1", userId: "someone-else" }));
    expect(service.revokeApiToken).toHaveBeenCalledWith("user-1", "tok-1");
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("does nothing without a token id", async () => {
    await revokeApiToken(form({}));
    expect(service.revokeApiToken).not.toHaveBeenCalled();
  });

  it("requires a signed-in user", async () => {
    vi.mocked(requireUser).mockRejectedValue(new Error("redirect /login"));
    await expect(revokeApiToken(form({ tokenId: "tok-1" }))).rejects.toThrow("redirect /login");
    expect(service.revokeApiToken).not.toHaveBeenCalled();
  });
});
