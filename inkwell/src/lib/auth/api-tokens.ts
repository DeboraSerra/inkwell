import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "./session";

const TOKEN_PREFIX = "ink_";

// Tokens are 256 bits of randomness, so a fast hash is enough; no salt or
// slow KDF is needed the way it would be for passwords.
const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function createApiToken(userId: string, name: string) {
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  await prisma.apiToken.create({
    data: {
      userId,
      name,
      tokenHash: hashToken(token),
      prefix: token.slice(0, TOKEN_PREFIX.length + 6),
    },
  });
  return token;
}

export function listApiTokens(userId: string) {
  return prisma.apiToken.findMany({
    where: { userId, revokedAt: null },
    select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeApiToken(userId: string, tokenId: string) {
  await prisma.apiToken.updateMany({
    where: { id: tokenId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function getUserFromBearerToken(request: Request) {
  const header = request.headers.get("authorization");
  const token = header?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token?.startsWith(TOKEN_PREFIX)) return null;

  const apiToken = await prisma.apiToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!apiToken || apiToken.revokedAt) return null;

  await prisma.apiToken.update({
    where: { id: apiToken.id },
    data: { lastUsedAt: new Date() },
  });
  return apiToken.user;
}

// For route handlers: accepts an API token (extension) or the session cookie (app).
export async function getRequestUser(request: Request) {
  if (request.headers.has("authorization")) return getUserFromBearerToken(request);
  return getCurrentUser();
}
