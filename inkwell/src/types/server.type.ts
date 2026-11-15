import type { Prisma, PrismaClient } from "@/generated/prisma/client";

// A transaction handle. Services pass it through to models without using it.
export type Tx = Prisma.TransactionClient;

// What model functions query: the client, or a transaction inside a service.
export type Db = PrismaClient | Tx;

export type DomainErrorCode = "NOT_FOUND" | "INVALID" | "UNAUTHORIZED" | "RATE_LIMITED";
