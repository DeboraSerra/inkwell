import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/auth.service");
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { isCronRequest } = await import("@/server/auth/auth.guard");
const request = (authorization?: string) =>
  new Request("http://app.test/api/cron/enrichment", { headers: authorization ? { authorization } : {} });

afterEach(() => {
  vi.unstubAllEnvs();
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
