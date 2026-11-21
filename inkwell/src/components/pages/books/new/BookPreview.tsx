"use client";

import { SHELVES, shelfHref } from "@/server/library/shelf-filters";
import { LIST_NAMES } from "@/server/library/status.rules";
import type {
  BookFormBook,
  BookFormResult,
  IsbnPreview,
} from "@/types/books.type";
import Link from "next/link";
import type { AddAction } from "@/types/ui.type";

// A book found by the form's ISBN lookup or title search, as the form's
// starting point.

const SOURCE_NAMES: Record<IsbnPreview["from"], string | null> = {
  CATALOG: null,
  OPEN_LIBRARY: "Open Library",
  GOOGLE_BOOKS: "Google Books",
};

// Above the form's fields: what the fields can't show. The year, where the
// details come from, and whether the reader has the book already. No cover:
// the user removed it from the top of the form.
export function PreviewHeader({ preview }: Readonly<{ preview: IsbnPreview }>) {
  const inLibrary = preview.inLibrary;
  const shelf =
    inLibrary && SHELVES.find(({ status }) => status === inLibrary.status);

  return (
    <div className='flex gap-2'>
      {shelf && (
        <p className='text-sm'>
          Already in your library, on {LIST_NAMES[shelf.status]}.{" "}
          <Link
            href={shelfHref({ shelf: shelf.slug, formats: [], search: "" })}
            className='underline'
          >
            View the shelf
          </Link>
        </p>
      )}
    </div>
  );
}

// The previewed book as the form's starting point. Its title, subtitle and
// ISBN are the catalog's, so the form shows them locked.
export const previewBook = (preview: IsbnPreview): BookFormBook => ({
  title: preview.title,
  subtitle: preview.subtitle,
  authors: preview.authors,
  coverUrl: preview.coverUrl,
  pageCount: preview.pageCount,
  isbn13: preview.isbn13,
  // Already in the library: the formats the reader owns, shown ticked.
  formats: preview.inLibrary?.formats,
});

// Only the ISBN, or the provider's record id, identifies the book: the server
// looks it up again itself.
export const previewHidden = (preview: IsbnPreview): Record<string, string> =>
  preview.ref
    ? { source: preview.ref.source, sourceId: preview.ref.sourceId }
    : { isbn: preview.isbn13 ?? "" };

// An add action as the book form's `submit`.
export const actionSubmit =
  (action: AddAction) =>
  async (formData: FormData): Promise<BookFormResult> => {
    const { error, message } = await action({}, formData);
    return { ok: !error, error, message };
  };
