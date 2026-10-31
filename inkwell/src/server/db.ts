import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../generated/prisma/client";

const createPrismaClient = () =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

// Reuse one client across hot reloads in development.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// A transaction handle. Services pass it through to models without using it.
export type Tx = Prisma.TransactionClient;
// What model functions query: the client, or a transaction inside a service.
export type Db = PrismaClient | Tx;

// Lets services make several model calls atomically without importing Prisma.
export const transaction = <T>(fn: (tx: Tx) => Promise<T>) => prisma.$transaction(fn);
