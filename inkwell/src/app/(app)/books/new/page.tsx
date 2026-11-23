import type { Metadata } from "next";
import { BooksNew } from "@/components/pages/books/new";
import { requireUser } from "@/server/auth/auth.guard";

// Each page has its own title, so tabs and screen readers can tell them apart.
export const metadata: Metadata = { title: "Add a book · Inkwell" };

export default async function AddBookPage() {
  await requireUser();

  return <BooksNew />;
}
