import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import * as authService from "./auth.service";

// Request-level authentication for controllers and pages. This is where the
// session cookie is read and written; services never see cookies or requests.

// Firebase Hosting only forwards a cookie with this name, so use it everywhere.
const SESSION_COOKIE = "__session";

export async function setSessionCookie(sessionCookie: string) {
  (await cookies()).set(SESSION_COOKIE, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: authService.SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async () => {
  const sessionCookie = (await cookies()).get(SESSION_COOKIE)?.value;
  return sessionCookie ? authService.getUserFromSession(sessionCookie) : null;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// For route handlers: accepts an API token (extension) or the session cookie (app).
export async function getRequestUser(request: Request) {
  const header = request.headers.get("authorization");
  if (header === null) return getCurrentUser();
  const token = /^Bearer (\S+)$/i.exec(header)?.[1];
  return token ? authService.getUserFromApiToken(token) : null;
}

const digest = (value: string) => createHash("sha256").update(value).digest();

// Vercel Schedules (path targets) send "Authorization: Bearer <CRON_SECRET>". Without the secret
// set, no request passes. Compared as hashes, in constant time.
export function isCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || !header) return false;
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
