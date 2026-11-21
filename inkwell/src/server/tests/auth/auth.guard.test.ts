import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as authService from "@/server/auth/auth.service";

vi.mock("@/server/auth/auth.service");
const jar = vi.hoisted(() => ({ session: undefined as string | undefined, set: vi.fn(), delete: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "__session" && jar.session !== undefined ? { value: jar.session } : undefined),
    set: jar.set,
    delete: jar.delete,
  }),
}));
// The real redirect throws to stop rendering; so does this one.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect ${path}`);
  }),
}));

const { clearSessionCookie, getRequestUser, isCronRequest, requireUser, setSessionCookie } = await import(
  "@/server/auth/auth.guard"
);
const service = vi.mocked(authService);
const user = { id: "user-1", email: "reader@example.com", name: "Reader" } as never;
const request = (authorization?: string) =>
  new Request("http://app.test/api/cron/enrichment", { headers: authorization ? { authorization } : {} });

beforeEach(() => {
  vi.clearAllMocks();
  jar.session = undefined;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getRequestUser", () => {
  it("uses the session cookie when there's no Authorization header", async () => {
    jar.session = "cookie-value";
    service.getUserFromSession.mockResolvedValue(user);
    await expect(getRequestUser(request())).resolves.toBe(user);
    expect(service.getUserFromSession).toHaveBeenCalledWith("cookie-value");
    expect(service.getUserFromApiToken).not.toHaveBeenCalled();
  });

  it("returns null with neither a header nor a cookie", async () => {
    await expect(getRequestUser(request())).resolves.toBeNull();
    expect(service.getUserFromSession).not.toHaveBeenCalled();
  });

  it.each(["Bearer ink_abc", "bearer ink_abc"])("checks the API token from %s", async (header) => {
    service.getUserFromApiToken.mockResolvedValue(user);
    await expect(getRequestUser(request(header))).resolves.toBe(user);
    expect(service.getUserFromApiToken).toHaveBeenCalledWith("ink_abc");
  });

  it("returns null for an unknown token", async () => {
    service.getUserFromApiToken.mockResolvedValue(null);
    await expect(getRequestUser(request("Bearer ink_nope"))).resolves.toBeNull();
  });

  it.each([
    ["an empty header", ""],
    ["another scheme", "Basic abc"],
    ["Bearer with no token", "Bearer "],
    ["a token with spaces", "Bearer ink_a ink_b"],
  ])("refuses %s without falling back to the cookie", async (_label, header) => {
    jar.session = "cookie-value";
    const withHeader = new Request("http://app.test/api/me", { headers: { authorization: header } });
    await expect(getRequestUser(withHeader)).resolves.toBeNull();
    expect(service.getUserFromApiToken).not.toHaveBeenCalled();
    expect(service.getUserFromSession).not.toHaveBeenCalled();
  });
});

describe("requireUser", () => {
  it("returns the session's user", async () => {
    jar.session = "cookie-value";
    service.getUserFromSession.mockResolvedValue(user);
    await expect(requireUser()).resolves.toBe(user);
  });

  it("redirects to /login without a cookie", async () => {
    await expect(requireUser()).rejects.toThrow("redirect /login");
  });

  it("redirects to /login for an invalid session", async () => {
    jar.session = "expired";
    service.getUserFromSession.mockResolvedValue(null);
    await expect(requireUser()).rejects.toThrow("redirect /login");
  });
});

describe("session cookie", () => {
  it("is set httpOnly, lax and site-wide for the session's lifetime", async () => {
    await setSessionCookie("cookie-value");
    expect(jar.set).toHaveBeenCalledWith(
      "__session",
      "cookie-value",
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 14 }),
    );
  });

  it("is cleared on sign-out", async () => {
    await clearSessionCookie();
    expect(jar.delete).toHaveBeenCalledWith("__session");
  });
});

describe("isCronRequest", () => {
  it("accepts the configured secret as a Bearer token", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(isCronRequest(request("Bearer s3cret"))).toBe(true);
  });

  it.each([
    ["no header", undefined],
    ["a wrong secret", "Bearer nope"],
    ["the secret without Bearer", "s3cret"],
  ])("refuses %s", (_label, header) => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(isCronRequest(request(header))).toBe(false);
  });

  it("refuses everything when no secret is set", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(isCronRequest(request("Bearer "))).toBe(false);
  });
});
