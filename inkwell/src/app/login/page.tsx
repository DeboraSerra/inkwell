import type { Metadata } from "next";
import { Login } from "@/components/pages/login";
import { getCurrentUser } from "@/server/auth/auth.guard";
import { redirect } from "next/navigation";

// Each page has its own title, so tabs and screen readers can tell them apart.
export const metadata: Metadata = { title: "Sign in · Inkwell" };

export default async function LoginPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ next?: string }>;
}>) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;

  return <Login next={next} />;
}
