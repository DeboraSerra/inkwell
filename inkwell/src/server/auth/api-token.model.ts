import "server-only";
import { prisma, type Db } from "@/server/db";

export function createApiToken(
  data: { userId: string; name: string; tokenHash: string; prefix: string },
  db: Db = prisma,
) {
  return db.apiToken.create({ data });
}

export function listActiveApiTokens(userId: string, db: Db = prisma) {
  return db.apiToken.findMany({
    where: { userId, revokedAt: null },
    select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export function revokeApiToken(userId: string, tokenId: string, db: Db = prisma) {
  return db.apiToken.updateMany({
    where: { id: tokenId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function findApiTokenByHash(tokenHash: string, db: Db = prisma) {
  return db.apiToken.findUnique({ where: { tokenHash }, include: { user: true } });
}

export function touchApiToken(id: string, db: Db = prisma) {
  return db.apiToken.update({ where: { id }, data: { lastUsedAt: new Date() } });
}
