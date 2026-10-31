"use client";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { signOut } from "@/server/auth/auth.controller";

export const SignOutItem = () => {
  // Wrapped so the click event isn't sent to the server action as an argument.
  return <DropdownMenuItem onClick={() => signOut()}>Sign out</DropdownMenuItem>;
};
