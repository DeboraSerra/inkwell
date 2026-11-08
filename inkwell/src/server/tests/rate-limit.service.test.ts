import { beforeEach, describe, expect, it, vi } from "vitest";
import { domainErrorResponse, RateLimitError } from "@/server/errors";
import * as rateLimitModel from "@/server/rate-limit/rate-limit.model";

vi.mock("@/server/rate-limit/rate-limit.model");

const service = await import("@/server/rate-limit/rate-limit.service");
const model = vi.mocked(rateLimitModel);

const NOW = new Date("2026-11-08T12:00:30Z");
const windowStart = new Date("2026-11-08T12:00:00Z");

beforeEach(() => {
  vi.resetAllMocks();
});

describe("consumeRateLimit", () => {
  it("counts the request in the user's bucket for a one-minute window", async () => {
    model.incrementRateLimit.mockResolvedValue({ count: 1, windowStart });
    await service.consumeRateLimit("user-1", "ISBN_LOOKUP", NOW);
    expect(model.incrementRateLimit).toHaveBeenCalledWith("user-1", "ISBN_LOOKUP", 60);
  });

  it("allows up to the limit", async () => {
    model.incrementRateLimit.mockResolvedValue({ count: 60, windowStart });
    await expect(service.consumeRateLimit("user-1", "BOOK_SEARCH", NOW)).resolves.toBeUndefined();
  });

  it("refuses past the limit, with the seconds left in the window", async () => {
    model.incrementRateLimit.mockResolvedValue({ count: 61, windowStart });
    const error = await service.consumeRateLimit("user-1", "ISBN_LOOKUP", NOW).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfterSeconds).toBe(30);
  });

  it("keeps Retry-After between 1 and 60 seconds when clocks disagree", async () => {
    const retryAfter = async (start: string) => {
      model.incrementRateLimit.mockResolvedValue({ count: 61, windowStart: new Date(start) });
      const error = await service.consumeRateLimit("u", "ISBN_LOOKUP", NOW).catch((e: unknown) => e);
      return (error as RateLimitError).retryAfterSeconds;
    };
    await expect(retryAfter("2026-11-08T11:00:00Z")).resolves.toBe(1);
    await expect(retryAfter("2026-11-08T13:00:00Z")).resolves.toBe(60);
  });
});

describe("domainErrorResponse for a rate limit", () => {
  it("is a 429 with Retry-After", async () => {
    const response = domainErrorResponse(new RateLimitError(17));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("17");
    await expect(response.json()).resolves.toEqual({ error: "Too many lookups. Try again in a minute." });
  });
});
