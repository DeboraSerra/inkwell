import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { AppSidebar } from "@/components/layout/Sidebar";
import { BooksContext } from "@/components/pages/context";
import { requireUser } from "@/server/auth/auth.guard";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireUser();

  // Every page in the app can read the user and the books from this context.
  return (
    <BooksContext user={user}>
      <AppSidebar />
      {/* On phones the tab bar is fixed to the bottom, so leave room for it. */}
      <main className='mx-auto w-full h-svh overflow-y-auto container flex-1 px-4 pt-6 pb-28 md:p-10 relative'>
        <p className='sr-only'>Signed in as {user.email}</p>
        {children}
      </main>
      <MobileTabBar />
    </BooksContext>
  );
}
