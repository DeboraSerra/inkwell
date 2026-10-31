"use server";

// Server actions for sign-in and API tokens. Everything exported here is a
// public endpoint, so each one authenticates and validates its own input.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DomainError } from "@/server/errors";
import { clearSessionCookie, requireUser, setSessionCookie } from "./auth.guard";
import * as authService from "./auth.service";

// Only allow same-site relative paths, so `?next=` can't become an open redirect.
const safeRedirectPath = (path: unknown) =>
  typeof path === "string" && path.startsWith("/") && !path.startsWith("//") ? path : "/";

export async function signIn(idToken: string, next?: string) {
  if (typeof idToken !== "string" || idToken.length > 4096) {
    return { error: "Invalid sign-in request." };
  }
  try {
    await setSessionCookie(await authService.createSession(idToken));
  } catch (error) {
    console.error("Failed to create session", error);
    return { error: "Couldn't sign you in. Please try again." };
  }
  redirect(safeRedirectPath(next));
}

export async function signOut() {
  await clearSessionCookie();
  redirect("/login");
}

export type CreateTokenState = { token?: string; error?: string };

export async function createApiToken(
  _prev: CreateTokenState,
  formData: FormData,
): Promise<CreateTokenState> {
  const user = await requireUser();
  const name = formData.get("name");
  try {
    const token = await authService.createApiToken(user.id, typeof name === "string" ? name : "");
    revalidatePath("/settings");
    return { token };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}

export async function revokeApiToken(formData: FormData) {
  const user = await requireUser();
  const tokenId = formData.get("tokenId");
  if (typeof tokenId !== "string") return;
  await authService.revokeApiToken(user.id, tokenId);
  revalidatePath("/settings");
}
