"use server";

import { redirect } from "next/navigation";
import { createSession, deleteSession } from "./session";

// Only allow same-site relative paths, so `?next=` can't become an open redirect.
const safeRedirectPath = (path: unknown) =>
  typeof path === "string" && path.startsWith("/") && !path.startsWith("//")
    ? path
    : "/";

export async function signIn(idToken: string, next?: string) {
  if (typeof idToken !== "string" || idToken.length > 4096) {
    return { error: "Invalid sign-in request." };
  }
  try {
    await createSession(idToken);
  } catch (error) {
    console.error("Failed to create session", error);
    return { error: "Couldn't sign you in. Please try again." };
  }
  redirect(safeRedirectPath(next));
}

export async function signOut() {
  await deleteSession();
  redirect("/login");
}
