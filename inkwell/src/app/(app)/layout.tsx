import { AppSidebar } from "@/components/layout/Sidebar";
import { requireUser } from "@/server/auth/auth.guard";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireUser();

  return (
    <>
      <AppSidebar />
      <main className='mx-auto w-full h-svh overflow-y-auto container flex-1 p-10 relative'>
        <p className='sr-only'>Signed in as {user.email}</p>
        {children}
      </main>
    </>
  );
}
