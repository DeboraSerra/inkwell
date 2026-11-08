import { redirect } from "next/navigation";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import { getCurrentUser } from "@/server/auth/auth.guard";

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
          <p className="text-muted-foreground">Your reading journal.</p>
        </div>
        <GoogleSignInButton next={next} />
      </div>
    </main>
  );
}
