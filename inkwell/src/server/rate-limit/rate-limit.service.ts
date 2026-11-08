import "server-only";
import { RateLimitError } from "@/server/errors";
import * as rateLimitModel from "./rate-limit.model";

// Counted in Postgres because serverless instances don't share memory. Limits
// a runaway client, or a leaked API token, from burning the book APIs' quotas.
export const RATE_LIMITS = {
  ISBN_LOOKUP: 60,
  BOOK_SEARCH: 60,
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

export const RATE_LIMIT_WINDOW_SECONDS = 60;

// Counts one request, and throws RateLimitError once the user is past the
// bucket's limit for the current minute.
export async function consumeRateLimit(userId: string, bucket: RateLimitBucket, now = new Date()) {
  const { count, windowStart } = await rateLimitModel.incrementRateLimit(
    userId,
    bucket,
    RATE_LIMIT_WINDOW_SECONDS,
  );
  if (count <= RATE_LIMITS[bucket]) return;

  const windowEnds = windowStart.getTime() + RATE_LIMIT_WINDOW_SECONDS * 1000;
  const retryAfter = Math.ceil((windowEnds - now.getTime()) / 1000);
  throw new RateLimitError(Math.min(Math.max(retryAfter, 1), RATE_LIMIT_WINDOW_SECONDS));
}
