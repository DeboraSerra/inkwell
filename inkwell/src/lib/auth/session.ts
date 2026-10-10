import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { adminAuth } from "@/config/firebase-admin";
import { prisma } from "@/lib/prisma";

// Firebase Hosting only forwards a cookie with this name, so use it everywhere.
export const SESSION_COOKIE = "__session";
// Firebase allows session cookies to last between 5 minutes and 2 weeks.
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;
// Only mint a session from a fresh sign-in, not from an old leaked ID token.
const MAX_SIGN_IN_AGE_SECONDS = 5 * 60;

export async function createSession(idToken: string) {
  const decoded = await adminAuth.verifyIdToken(idToken, true);
  if (Date.now() / 1000 - decoded.auth_time > MAX_SIGN_IN_AGE_SECONDS) {
    throw new Error("Recent sign-in required");
  }
  if (!decoded.email) throw new Error("Account has no email address");

  const sessionCookie = await adminAuth.createSessionCookie(idToken, {
    expiresIn: SESSION_MAX_AGE_SECONDS * 1000,
  });

  await prisma.user.upsert({
    where: { id: decoded.uid },
    create: { id: decoded.uid, email: decoded.email, name: decoded.name },
    update: { email: decoded.email },
  });

  (await cookies()).set(SESSION_COOKIE, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function deleteSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

// Returns the Firebase UID of a valid, non-revoked session, or null.
export const getSessionUid = cache(async () => {
  const sessionCookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionCookie) return null;
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    return decoded.uid;
  } catch {
    return null;
  }
});

export const getCurrentUser = cache(async () => {
  const uid = await getSessionUid();
  if (!uid) return null;
  return prisma.user.findUnique({ where: { id: uid } });
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
