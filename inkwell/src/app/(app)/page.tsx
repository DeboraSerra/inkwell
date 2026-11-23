import type { Metadata } from "next";
import { requireUser } from "@/server/auth/auth.guard";

// Each page has its own title, so tabs and screen readers can tell them apart.
export const metadata: Metadata = { title: "Inkwell" };

export default async function Home() {
  const user = await requireUser();

  return (
    <h1 className="text-2xl font-semibold">
      Welcome{user.name ? `, ${user.name}` : ""}
    </h1>
  );
}
