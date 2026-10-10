"use server";

import { revalidatePath } from "next/cache";
import { createApiToken, revokeApiToken } from "@/lib/auth/api-tokens";
import { requireUser } from "@/lib/auth/session";

export type CreateTokenState = { token?: string; error?: string };

export async function createTokenAction(
  _prev: CreateTokenState,
  formData: FormData,
): Promise<CreateTokenState> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 100) {
    return { error: "Give the token a name (up to 100 characters)." };
  }
  const token = await createApiToken(user.id, name);
  revalidatePath("/settings");
  return { token };
}

export async function revokeTokenAction(formData: FormData) {
  const user = await requireUser();
  const tokenId = formData.get("tokenId");
  if (typeof tokenId !== "string") return;
  await revokeApiToken(user.id, tokenId);
  revalidatePath("/settings");
}
