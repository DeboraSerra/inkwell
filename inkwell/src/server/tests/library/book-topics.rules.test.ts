import { describe, expect, it } from "vitest";
import { firstTopic, shownTopics, topicEdits, topicsInUse } from "@/server/library/book-topics.rules";
import type { LibraryTopicRow } from "@/types/library.type";

const at = (day: number) => new Date(Date.UTC(2026, 10, day));
const ai = (name: string, day = 1) => ({ name, source: "AI" as const, createdAt: at(day) });
const user = (name: string, day = 1) => ({ name, source: "USER" as const, createdAt: at(day) });

describe("firstTopic", () => {
  it("prefers the reader's pick, then the oldest", () => {
    expect(firstTopic([ai("Fantasy", 1), user("Romance", 5)])).toBe("Romance");
    expect(firstTopic([ai("Later", 3), ai("First", 2)])).toBe("First");
  });

  it("is null for none", () => {
    expect(firstTopic([])).toBeNull();
  });
});

const notEdited = { genre: null, genreEdited: false, trope: null, tropeEdited: false, tags: [], tagsEdited: false };
const catalog = { genres: [ai("Romance")], tropes: [ai("Enemies to Lovers")], tags: ["rivals"] };

describe("shownTopics", () => {
  it("shows the catalog's until the reader edits", () => {
    expect(shownTopics(notEdited, catalog)).toEqual({ genre: "Romance", trope: "Enemies to Lovers", tags: ["rivals"] });
  });

  it("shows the reader's edits, including a removed genre or tags", () => {
    expect(
      shownTopics({ ...notEdited, genreEdited: true, trope: "Found Family", tropeEdited: true, tagsEdited: true }, catalog),
    ).toEqual({ genre: null, trope: "Found Family", tags: [] });
  });

  it("treats the catalog's NULL tags as none", () => {
    expect(shownTopics(notEdited, { ...catalog, tags: null }).tags).toEqual([]);
  });
});

describe("topicEdits", () => {
  const shown = { genre: "Romance", trope: "Enemies to Lovers", tags: ["rivals"] };

  it("keeps nothing when the reader leaves the catalog's values", () => {
    expect(topicEdits(shown, shown)).toEqual({
      genre: { edited: false, name: null },
      trope: { edited: false, name: null },
      tags: { edited: false, tags: [] },
    });
  });

  it("keeps a changed or removed value as the reader's", () => {
    expect(topicEdits({ genre: "Fantasy", trope: null, tags: ["fae", "rivals"] }, shown)).toEqual({
      genre: { edited: true, name: "Fantasy" },
      trope: { edited: true, name: null },
      tags: { edited: true, tags: ["fae", "rivals"] },
    });
  });
});

describe("topicsInUse", () => {
  const row = (over: Partial<LibraryTopicRow> = {}): LibraryTopicRow => ({
    genreEdited: false,
    genre: null,
    tropeEdited: false,
    trope: null,
    book: {
      genres: [{ genre: { name: "Romance" } }, { genre: { name: "Fantasy" } }],
      tropes: [{ trope: { name: "Enemies to Lovers" } }],
    },
    ...over,
  });

  it("is empty for an empty library", () => {
    expect(topicsInUse([])).toEqual({ genres: [], tropes: [] });
  });

  it("takes every catalog genre and trope of an unedited book, sorted and once each", () => {
    expect(topicsInUse([row(), row()])).toEqual({ genres: ["Fantasy", "Romance"], tropes: ["Enemies to Lovers"] });
  });

  it("takes the reader's own once edited, instead of the catalog's", () => {
    expect(
      topicsInUse([row({ genreEdited: true, genre: { name: "Horror" }, tropeEdited: true, trope: { name: "Haunted House" } })]),
    ).toEqual({ genres: ["Horror"], tropes: ["Haunted House"] });
  });

  it("takes none when the reader removed them", () => {
    expect(topicsInUse([row({ genreEdited: true, tropeEdited: true })])).toEqual({ genres: [], tropes: [] });
  });
});
