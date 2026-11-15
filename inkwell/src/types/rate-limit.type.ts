import type { RATE_LIMITS } from "@/server/rate-limit/rate-limit.service";

export type RateLimitBucket = keyof typeof RATE_LIMITS;

export type RateLimitCount = { count: number; windowStart: Date };
