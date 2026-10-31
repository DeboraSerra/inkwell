import { requireUser } from "@/server/auth/auth.guard";

export default async function Home() {
  const user = await requireUser();

  return (
    <h1 className="text-2xl font-semibold">
      Welcome{user.name ? `, ${user.name}` : ""}
    </h1>
  );
}
