import "server-only";
import { prisma, type Db } from "@/server/db";

export type RateLimitCount = { count: number; windowStart: Date };

// Counts one request in the user's current window, atomically, and returns the
// new count. A window older than `windowSeconds` starts over at 1. Both the
// check and the reset use the database clock, so app servers whose clocks
// differ still agree. Raw SQL because Prisma's upsert can't express the reset.
export async function incrementRateLimit(
  userId: string,
  bucket: string,
  windowSeconds: number,
  db: Db = prisma,
): Promise<RateLimitCount> {
  const rows = await db.$queryRaw<RateLimitCount[]>`
    INSERT INTO "RateLimit" ("userId", "bucket", "windowStart", "count")
    VALUES (${userId}, ${bucket}, now(), 1)
    ON CONFLICT ("userId", "bucket") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimit"."windowStart" <= now() - ${windowSeconds}::int * interval '1 second' THEN 1
        ELSE "RateLimit"."count" + 1
      END,
      "windowStart" = CASE
        WHEN "RateLimit"."windowStart" <= now() - ${windowSeconds}::int * interval '1 second' THEN now()
        ELSE "RateLimit"."windowStart"
      END
    RETURNING "count", "windowStart"`;
  const row = rows.at(0);
  if (!row) throw new Error("Rate limit upsert returned no row");
  return row;
}
