import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { adminAuth } from "@/config/firebase-admin";
import { UnauthorizedError, ValidationError } from "@/server/errors";
import * as apiTokenModel from "./api-token.model";
import * as userModel from "./user.model";

// Firebase allows session cookies to last between 5 minutes and 2 weeks.
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;
// Only mint a session from a fresh sign-in, not from an old leaked ID token.
const MAX_SIGN_IN_AGE_SECONDS = 5 * 60;
const TOKEN_PREFIX = "ink_";
const MAX_TOKEN_NAME_LENGTH = 100;

// Verifies a fresh Firebase ID token, makes sure the user exists, and returns
// a session cookie value for the controller to set.
export async function createSession(idToken: string) {
  const decoded = await adminAuth.verifyIdToken(idToken, true).catch(() => {
    throw new UnauthorizedError("Invalid sign-in token");
  });
  if (Date.now() / 1000 - decoded.auth_time > MAX_SIGN_IN_AGE_SECONDS) {
    throw new UnauthorizedError("Recent sign-in required");
  }
  if (!decoded.email) throw new UnauthorizedError("Account has no email address");

  const sessionCookie = await adminAuth.createSessionCookie(idToken, {
    expiresIn: SESSION_MAX_AGE_SECONDS * 1000,
  });
  await userModel.upsertUser({ id: decoded.uid, email: decoded.email, name: decoded.name });
  return sessionCookie;
}

// Returns the user for a valid, non-revoked session cookie, or null.
export async function getUserFromSession(sessionCookie: string) {
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    return await userModel.findUserById(decoded.uid);
  } catch {
    return null;
  }
}

// Tokens are 256 bits of randomness, so a fast hash is enough; no salt or
// slow KDF is needed the way it would be for passwords.
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// Returns the plain token. It's shown to the user once and never stored.
export async function createApiToken(userId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_TOKEN_NAME_LENGTH) {
    throw new ValidationError(
      `Give the token a name (up to ${MAX_TOKEN_NAME_LENGTH} characters).`,
    );
  }
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  await apiTokenModel.createApiToken({
    userId,
    name: trimmed,
    tokenHash: hashToken(token),
    prefix: token.slice(0, TOKEN_PREFIX.length + 6),
  });
  return token;
}

export const listApiTokens = (userId: string) => apiTokenModel.listActiveApiTokens(userId);

export async function revokeApiToken(userId: string, tokenId: string) {
  await apiTokenModel.revokeApiToken(userId, tokenId);
}

// Returns the token's user, or null for an unknown or revoked token.
export async function getUserFromApiToken(token: string) {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const apiToken = await apiTokenModel.findApiTokenByHash(hashToken(token));
  if (!apiToken || apiToken.revokedAt) return null;
  await apiTokenModel.touchApiToken(apiToken.id);
  return apiToken.user;
}
