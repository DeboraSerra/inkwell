import { Login } from "@/components/pages/login";
import { getCurrentUser } from "@/server/auth/auth.guard";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ next?: string }>;
}>) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;

  return <Login next={next} />;
}
