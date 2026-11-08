import { BooksNew } from "@/components/pages/books/new";
import { requireUser } from "@/server/auth/auth.guard";

export default async function AddBookPage() {
  await requireUser();

  return <BooksNew />;
}
