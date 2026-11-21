// Which genre, trope and tags a shelf book shows, and what a reader's edit of
// them stores. Pure, so it's unit-tested without the database.
import { TagSource } from "@/generated/prisma/enums";
import type { CatalogTopics, ReaderTopics, TaggedName, TopicChoice } from "@/types/library.type";

// The reader's own pick first (USER, from 5b6), then the oldest; null for none.
export function firstTopic(rows: TaggedName[]) {
  const sorted = [...rows].sort(
    (a, b) =>
      Number(b.source === TagSource.USER) - Number(a.source === TagSource.USER) ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
  return sorted.at(0)?.name ?? null;
}

// What a reader sees: their own value once they've edited it (null or empty
// meaning they removed it), else the catalog's.
export function shownTopics(userBook: ReaderTopics, catalog: CatalogTopics) {
  return {
    genre: userBook.genreEdited ? userBook.genre : firstTopic(catalog.genres),
    trope: userBook.tropeEdited ? userBook.trope : firstTopic(catalog.tropes),
    tags: userBook.tagsEdited ? userBook.tags : (catalog.tags ?? []),
  };
}

const sameTags = (a: string[], b: string[]) => a.length === b.length && a.every((tag, i) => tag === b[i]);

// A reader's edit, kept only where it differs from the catalog's, so setting a
// value back to the catalog's follows the catalog again (as authors do).
export function topicEdits(edit: TopicChoice, catalog: { genre: string | null; trope: string | null; tags: string[] }) {
  return {
    genre: edit.genre === catalog.genre ? { edited: false, name: null } : { edited: true, name: edit.genre },
    trope: edit.trope === catalog.trope ? { edited: false, name: null } : { edited: true, name: edit.trope },
    tags: sameTags(edit.tags, catalog.tags) ? { edited: false, tags: [] } : { edited: true, tags: edit.tags },
  };
}
