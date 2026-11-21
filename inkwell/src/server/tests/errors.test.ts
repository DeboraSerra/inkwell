import { describe, expect, it } from "vitest";
import {
  DomainError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
  domainErrorResponse,
} from "@/server/errors";

describe("domain errors", () => {
  it.each([
    [new NotFoundError(), "NOT_FOUND", "Not found", "NotFoundError"],
    [new ValidationError("Bad title"), "INVALID", "Bad title", "ValidationError"],
    [new UnauthorizedError(), "UNAUTHORIZED", "Unauthorized", "UnauthorizedError"],
    [new RateLimitError(30), "RATE_LIMITED", "Too many lookups. Try again in a minute.", "RateLimitError"],
  ])("%s has its code, message and name", (error, code, message, name) => {
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe(code);
    expect(error.message).toBe(message);
    expect(error.name).toBe(name);
  });

  it("names a subclass after itself", () => {
    class ShelfFullError extends ValidationError {}
    expect(new ShelfFullError("Full").name).toBe("ShelfFullError");
  });
});

describe("domainErrorResponse", () => {
  it.each([
    [new NotFoundError("No book"), 404],
    [new ValidationError("Bad title"), 422],
    [new UnauthorizedError(), 401],
    [new RateLimitError(12), 429],
  ])("maps %s to %i with its message", async (error, status) => {
    const response = domainErrorResponse(error);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: error.message });
  });

  it("sets Retry-After only on rate-limit errors", () => {
    expect(domainErrorResponse(new RateLimitError(12)).headers.get("Retry-After")).toBe("12");
    expect(domainErrorResponse(new NotFoundError()).headers.get("Retry-After")).toBeNull();
  });

  it.each([
    ["a plain Error", new Error("boom")],
    ["a string", "boom"],
    ["undefined", undefined],
  ])("rethrows %s unchanged", (_label, error) => {
    let thrown: unknown = "nothing thrown";
    try {
      domainErrorResponse(error);
    } catch (caught) {
      thrown = caught;
    }
    expect(thrown).toBe(error);
  });
});
