import { BooksShelves } from "@/components/pages/books/shelves";
import { requireUser } from "@/server/auth/auth.guard";
import { listTopics } from "@/server/books/book.service";

// The books come from the app-wide BooksContext, set up in the (app) layout.
// The genre and trope names, for the filter, are the same for every shelf.
export default async function ShelvesPage() {
  await requireUser();
  return <BooksShelves topics={await listTopics()} />;
}
