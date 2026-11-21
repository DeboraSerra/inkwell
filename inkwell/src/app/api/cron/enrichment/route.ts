import { isCronRequest } from "@/server/auth/auth.guard";
import { runEnrichmentCron } from "@/server/enrichment/enrichment.service";

// Collecting a large batch writes a row or two per book.
export const maxDuration = 300;

// Run once a day by Vercel Cron (vercel.json): collects ended enrichment
// batches, then sends the backlog as a new one.
export async function GET(request: Request) {
  if (!isCronRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await runEnrichmentCron());
}
