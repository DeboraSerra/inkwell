import { AppSidebar, Trigger } from "@/components/layout/Sidebar";
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
      <main className='mx-auto w-full container flex-1 p-10 relative'>
        <Trigger />
        <p className='sr-only'>Signed in as {user.email}</p>
        {children}
      </main>
    </>
  );
}
