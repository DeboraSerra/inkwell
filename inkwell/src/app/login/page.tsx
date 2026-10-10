import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import GoogleSignInButton from "./google-sign-in-button";

export default async function LoginPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ next?: string }>;
}>) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">Inkwell</h1>
          <p className="text-zinc-600 dark:text-zinc-400">Your reading journal.</p>
        </div>
        <GoogleSignInButton next={next} />
      </div>
    </main>
  );
}
