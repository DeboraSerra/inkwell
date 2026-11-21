import { beforeEach, describe, expect, it, vi } from "vitest";
import { isCronRequest } from "@/server/auth/auth.guard";
import { runEnrichmentCron } from "@/server/enrichment/enrichment.service";

vi.mock("@/server/auth/auth.guard");
vi.mock("@/server/enrichment/enrichment.service");

const { GET } = await import("@/app/api/cron/enrichment/route");
const get = () => GET(new Request("http://app.test/api/cron/enrichment"));

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/cron/enrichment", () => {
  it("refuses a request without the cron secret, before doing anything", async () => {
    vi.mocked(isCronRequest).mockReturnValue(false);
    expect((await get()).status).toBe(401);
    expect(runEnrichmentCron).not.toHaveBeenCalled();
  });

  it("runs the cron and reports what it did", async () => {
    vi.mocked(isCronRequest).mockReturnValue(true);
    const summary = { collected: { batches: 1, enriched: 2, failed: 0, skipped: 0 }, submitted: null };
    vi.mocked(runEnrichmentCron).mockResolvedValue(summary);
    const response = await get();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(summary);
  });
});
