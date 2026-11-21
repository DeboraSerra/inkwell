import { beforeEach, describe, expect, it, vi } from "vitest";
import * as anthropic from "@/config/anthropic";
import { fillMissingDescription } from "@/server/books/book.service";
import * as enrichmentModel from "@/server/enrichment/enrichment.model";
import { NotFoundError, ValidationError } from "@/server/errors";

vi.mock("@/config/anthropic");
vi.mock("@/server/books/book.service");
vi.mock("@/server/enrichment/enrichment.model");
vi.mock("@/server/db", () => ({ transaction: (fn: (tx: unknown) => unknown) => fn("tx") }));

const { collectEnrichmentBatches, enrichBook, enrichImportedBooks, runEnrichmentCron, submitEnrichmentBatch } =
  await import("@/server/enrichment/enrichment.service");
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
    api.createMessage.mockResolvedValue(message({ genres: [], tropes: [], tags: ["desert"] }));
    model.saveEnrichment.mockResolvedValue(false);
    await expect(enrichBook("b1")).resolves.toBe("already-enriched");
  });
});

describe("submitEnrichmentBatch", () => {
  beforeEach(() => {
    model.findBooksNeedingSynopsis.mockResolvedValue([]);
    model.findPendingBookIds.mockResolvedValue(["pending-1"]);
    model.findBooksToEnrich.mockResolvedValue([book, { ...book, id: "b2" }]);
    api.createBatch.mockResolvedValue({ id: "msgbatch_1" } as never);
  });

  it("sends each book keyed by its id, with the lists cached, and records the batch", async () => {
    await expect(submitEnrichmentBatch()).resolves.toEqual({ batchId: "msgbatch_1", books: 2 });
    expect(model.findBooksToEnrich).toHaveBeenCalledWith(3, 1000, ["pending-1"], undefined);
    const requests = api.createBatch.mock.calls[0][0];
    expect(requests.map((request) => request.custom_id)).toEqual(["b1", "b2"]);
    expect(requests[0].params.system).toEqual([expect.objectContaining({ cache_control: { type: "ephemeral" } })]);
    expect(model.createEnrichmentBatch).toHaveBeenCalledWith("msgbatch_1", ["b1", "b2"]);
  });

  it("looks up missing synopses first, for the same books", async () => {
    const needing = { id: "b3", ownerId: null, isbn13: "9780441013593" } as never;
    model.findBooksNeedingSynopsis.mockResolvedValue([needing]);
    await submitEnrichmentBatch(["b1", "b3"]);
    expect(model.findBooksNeedingSynopsis).toHaveBeenCalledWith(3, 40, ["b1", "b3"]);
    expect(fillMissingDescription).toHaveBeenCalledWith(needing);
    expect(model.findBooksToEnrich).toHaveBeenCalledWith(3, 1000, ["pending-1"], ["b1", "b3"]);
  });

  it("sends nothing when no book is left", async () => {
    model.findBooksToEnrich.mockResolvedValue([]);
    await expect(submitEnrichmentBatch()).resolves.toBeNull();
    expect(api.createBatch).not.toHaveBeenCalled();
  });

  it("does nothing for an import with no shared books", async () => {
    await expect(submitEnrichmentBatch([])).resolves.toBeNull();
    expect(model.findBooksToEnrich).not.toHaveBeenCalled();
  });
});

describe("enrichImportedBooks", () => {
  it("logs a failure instead of failing the import", async () => {
    model.findBooksNeedingSynopsis.mockRejectedValue(new Error("database down"));
    await expect(enrichImportedBooks(["b1"])).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });
});

describe("collectEnrichmentBatches", () => {
  const batch = { id: "row-1", anthropicBatchId: "msgbatch_1", bookIds: ["b1", "b2", "b3", "b4"] };
  const results = (...items: unknown[]) =>
    (async function* () {
      yield* items;
    })() as never;
  const succeeded = (customId: string, json: unknown) => ({
    custom_id: customId,
    result: { type: "succeeded", message: message(json) },
  });

  beforeEach(() => {
    model.findSubmittedBatches.mockResolvedValue([batch] as never);
    api.retrieveBatch.mockResolvedValue({ processing_status: "ended" } as never);
  });

  it("writes each result to the book named by its custom_id, and marks the batch collected", async () => {
    model.findBookForEnrichment.mockImplementation(((id: string) => Promise.resolve({ ...book, id })) as never);
    api.batchResults.mockResolvedValue(
      results(
        { custom_id: "b3", result: { type: "errored", error: { type: "error" } } },
        succeeded("b2", { genres: ["Science Fiction"], tropes: [], tags: ["desert"] }),
        { custom_id: "b4", result: { type: "expired" } },
        succeeded("b1", { genres: "bad" }),
      ),
    );
    await expect(collectEnrichmentBatches()).resolves.toEqual({ batches: 1, enriched: 1, failed: 2, skipped: 1 });
    expect(model.saveEnrichment).toHaveBeenCalledTimes(1);
    expect(model.saveEnrichment).toHaveBeenCalledWith("b2", expect.objectContaining({ genreIds: ["g-sf"] }), "tx");
    expect(model.recordFailedAttempt.mock.calls.map((call) => call[0]).sort()).toEqual(["b1", "b3"]);
    expect(model.markBatchCollected).toHaveBeenCalledWith("row-1");
  });

  it("ignores a result for a book the batch wasn't sent with", async () => {
    api.batchResults.mockResolvedValue(results(succeeded("someone-else", { genres: [], tropes: [], tags: ["x"] })));
    await collectEnrichmentBatches();
    expect(model.findBookForEnrichment).not.toHaveBeenCalled();
    expect(model.saveEnrichment).not.toHaveBeenCalled();
  });

  it("never writes to a book that became private", async () => {
    model.findBookForEnrichment.mockResolvedValue({ ...book, ownerId: "user-1" });
    api.batchResults.mockResolvedValue(results(succeeded("b1", { genres: [], tropes: [], tags: ["x"] })));
    await collectEnrichmentBatches();
    expect(model.saveEnrichment).not.toHaveBeenCalled();
  });

  it("leaves a batch that's still processing", async () => {
    api.retrieveBatch.mockResolvedValue({ processing_status: "in_progress" } as never);
    await expect(collectEnrichmentBatches()).resolves.toMatchObject({ batches: 0 });
    expect(api.batchResults).not.toHaveBeenCalled();
    expect(model.markBatchCollected).not.toHaveBeenCalled();
  });
});

describe("runEnrichmentCron", () => {
  it("collects first, then sends the backlog", async () => {
    model.findSubmittedBatches.mockResolvedValue([]);
    model.findBooksNeedingSynopsis.mockResolvedValue([]);
    model.findPendingBookIds.mockResolvedValue([]);
    model.findBooksToEnrich.mockResolvedValue([]);
    await expect(runEnrichmentCron()).resolves.toEqual({
      collected: { batches: 0, enriched: 0, failed: 0, skipped: 0 },
      submitted: null,
    });
  });
});
