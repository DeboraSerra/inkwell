// The shelf's genre and trope filter. Pure, so it's unit-tested without a
// browser, and shared with the client component.
import type { TopicLists, TopicNames } from "@/types/shelf.type";

const inAny = (trope: TopicLists["tropes"][number], genres: string[]) =>
  trope.genres.some((genre) => genres.includes(genre));

// The ticked tropes that still belong to a ticked genre. Tropes are only shown
// under a ticked genre, so unticking one never leaves a trope that can't be seen.
export function tropesForGenres(topics: TopicLists, genres: string[], tropes: string[]) {
  return tropes.filter((name) => topics.tropes.some((trope) => trope.name === name && inAny(trope, genres)));
}

// The ticked genres' tropes, plus any ticked trope that belongs to none of
// them (an old link, the back button), so it can still be unticked.
export function shownTropes(topics: TopicLists, genres: string[], tropes: string[]) {
  return topics.tropes.filter((trope) => tropes.includes(trope.name) || inAny(trope, genres));
}

// The curated lists narrowed to the names in use, keeping their order and each
// trope's genres.
export function onlyInUse(topics: TopicLists, used: TopicNames): TopicLists {
  return {
    genres: topics.genres.filter((genre) => used.genres.includes(genre)),
    tropes: topics.tropes.filter((trope) => used.tropes.includes(trope.name)),
  };
}
