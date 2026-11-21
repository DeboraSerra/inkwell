import { beforeEach, describe, expect, it, vi } from "vitest";
import * as anthropic from "@/config/anthropic";
import * as enrichmentModel from "@/server/enrichment/enrichment.model";
import { NotFoundError, ValidationError } from "@/server/errors";

vi.mock("@/config/anthropic");
vi.mock("@/server/enrichment/enrichment.model");
vi.mock("@/server/db", () => ({ transaction: (fn: (tx: unknown) => unknown) => fn("tx") }));

const { enrichBook } = await import("@/server/enrichment/enrichment.service");
const model = vi.mocked(enrichmentModel);
const api = vi.mocked(anthropic);

const book = {
  id: "b1",
  ownerId: null,
  title: "Dune",
  subtitle: null,
  authors: ["Frank Herbert"],
  description: null,
  pageCount: 600,
  publishedYear: 1965,
  aiEnrichedAt: null,
  aiAttempts: 0,
};
const lists = {
  genres: [{ id: "g-sf", name: "Science Fiction", description: null }],
  tropes: [{ id: "t-chosen", name: "Chosen One", description: null }],
};
const message = (json: unknown, stop_reason = "end_turn") =>
  ({ stop_reason, content: [{ type: "text", text: JSON.stringify(json) }] }) as never;

beforeEach(() => {
  vi.resetAllMocks();
  model.findBookForEnrichment.mockResolvedValue(book);
  model.findEnrichmentLists.mockResolvedValue(lists);
  model.saveEnrichment.mockResolvedValue(true);
  api.isAnthropicApiError.mockReturnValue(true);
  api.isAnthropicConfigError.mockReturnValue(false);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("enrichBook", () => {
  it("saves only the genres and tropes on the lists, in a transaction", async () => {
    api.createMessage.mockResolvedValue(
      message({ genres: ["Science Fiction", "Space Opera"], tropes: ["Chosen One"], tags: ["Desert"] }),
    );
    await expect(enrichBook("b1")).resolves.toBe("enriched");
    expect(model.saveEnrichment).toHaveBeenCalledWith(
      "b1",
      { genreIds: ["g-sf"], tropeIds: ["t-chosen"], tags: ["desert"], lengthCategory: "LONG" },
      "tx",
    );
    expect(model.recordFailedAttempt).not.toHaveBeenCalled();
  });

  it("refuses a private book without calling the API", async () => {
    model.findBookForEnrichment.mockResolvedValue({ ...book, ownerId: "user-1" });
    await expect(enrichBook("b1")).rejects.toBeInstanceOf(ValidationError);
    expect(api.createMessage).not.toHaveBeenCalled();
  });

  it("throws for a book that doesn't exist", async () => {
    model.findBookForEnrichment.mockResolvedValue(null);
    await expect(enrichBook("b1")).rejects.toBeInstanceOf(NotFoundError);
  });

  it.each([
    ["already enriched", { aiEnrichedAt: new Date() }, "already-enriched"],
    ["out of attempts", { aiAttempts: 3 }, "gave-up"],
  ])("doesn't call the API for a book %s", async (_label, change, outcome) => {
    model.findBookForEnrichment.mockResolvedValue({ ...book, ...change });
    await expect(enrichBook("b1")).resolves.toBe(outcome);
    expect(api.createMessage).not.toHaveBeenCalled();
  });

  it("counts a refusal as a failed attempt and writes nothing", async () => {
    api.createMessage.mockResolvedValue(message({ genres: [], tropes: [], tags: [] }, "refusal"));
    await expect(enrichBook("b1")).resolves.toBe("failed");
    expect(model.recordFailedAttempt).toHaveBeenCalledWith("b1");
    expect(model.saveEnrichment).not.toHaveBeenCalled();
  });

  it("counts an invalid reply as a failed attempt", async () => {
    api.createMessage.mockResolvedValue(message({ genres: "Science Fiction" }));
    await expect(enrichBook("b1")).resolves.toBe("failed");
    expect(model.recordFailedAttempt).toHaveBeenCalledWith("b1");
  });

  it("counts a failed call as a failed attempt", async () => {
    api.createMessage.mockRejectedValue(new Error("503"));
    await expect(enrichBook("b1")).resolves.toBe("failed");
    expect(model.recordFailedAttempt).toHaveBeenCalledWith("b1");
  });

  it("rethrows a key problem or a bug without counting it", async () => {
    api.createMessage.mockRejectedValue(new Error("401"));
    api.isAnthropicConfigError.mockReturnValue(true);
    await expect(enrichBook("b1")).rejects.toThrow("401");

    api.isAnthropicConfigError.mockReturnValue(false);
    api.isAnthropicApiError.mockReturnValue(false);
    await expect(enrichBook("b1")).rejects.toThrow("401");
    expect(model.recordFailedAttempt).not.toHaveBeenCalled();
  });

  it("reports a book enriched by another run meanwhile", async () => {
    api.createMessage.mockResolvedValue(message({ genres: [], tropes: [], tags: [] }));
    model.saveEnrichment.mockResolvedValue(false);
    await expect(enrichBook("b1")).resolves.toBe("already-enriched");
  });
});
