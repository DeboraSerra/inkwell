import type { Metadata } from "next";
import { BooksShelves } from "@/components/pages/books/shelves";
import { requireUser } from "@/server/auth/auth.guard";
import { listTopics } from "@/server/books/book.service";
import { listLibraryTopics } from "@/server/library/library.service";
import { showsAllTopics, TOPIC_SCOPE_COOKIE } from "@/server/library/shelf-filters";
import { cookies } from "next/headers";

// Each page has its own title, so tabs and screen readers can tell them apart.
export const metadata: Metadata = { title: "Shelves · Inkwell" };

// The books come from the app-wide BooksContext, set up in the (app) layout.
// The genre and trope names, for the filter, are the same for every shelf:
// both the curated lists and the reader's, so the filter's switch between them
// needs no request.
export default async function ShelvesPage() {
  const user = await requireUser();
  const [topics, libraryTopics, store] = await Promise.all([listTopics(), listLibraryTopics(user.id), cookies()]);
  return (
    <BooksShelves
      topics={topics}
      libraryTopics={libraryTopics}
      onlyMyTopics={!showsAllTopics(store.get(TOPIC_SCOPE_COOKIE)?.value)}
    />
  );
}
