import Link from "next/link";
import { signOut } from "@/server/auth/auth.controller";
import { requireUser } from "@/server/auth/auth.guard";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireUser();

  return (
    <>
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <nav className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
          <Link href="/" className="font-semibold">
            Inkwell
          </Link>
          <Link href="/settings" className="ml-auto text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
            Settings
          </Link>
          <form action={signOut}>
            <button type="submit" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
              Sign out
            </button>
          </form>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <p className="sr-only">Signed in as {user.email}</p>
        {children}
      </main>
    </>
  );
}
