import { describe, expect, it } from "vitest";
import { onlyInUse, shownTropes, tropesForGenres } from "@/server/library/topic-filter.rules";
import type { TopicLists } from "@/types/shelf.type";

const topics: TopicLists = {
  genres: ["Fantasy", "Romance", "Thriller"],
  tropes: [
    { name: "Chosen One", genres: ["Fantasy"] },
    { name: "Enemies to Lovers", genres: ["Fantasy", "Romance"] },
    { name: "Unreliable Narrator", genres: ["Thriller"] },
  ],
};

describe("tropesForGenres", () => {
  it("clears every trope when no genre is left", () => {
    expect(tropesForGenres(topics, [], ["Chosen One", "Enemies to Lovers"])).toEqual([]);
  });

  it("drops only the tropes none of the remaining genres has", () => {
    expect(tropesForGenres(topics, ["Romance"], ["Chosen One", "Enemies to Lovers"])).toEqual(["Enemies to Lovers"]);
  });

  it("keeps every trope a remaining genre has", () => {
    expect(tropesForGenres(topics, ["Fantasy", "Thriller"], ["Chosen One", "Unreliable Narrator"])).toEqual([
      "Chosen One",
      "Unreliable Narrator",
    ]);
  });

  it("drops a trope that isn't in the curated list", () => {
    expect(tropesForGenres(topics, ["Fantasy"], ["Made Up"])).toEqual([]);
  });
});

describe("shownTropes", () => {
  it("shows nothing with no genre and no trope ticked", () => {
    expect(shownTropes(topics, [], [])).toEqual([]);
  });

  it("shows the ticked genres' tropes", () => {
    expect(shownTropes(topics, ["Romance"], []).map(({ name }) => name)).toEqual(["Enemies to Lovers"]);
  });

  it("still shows an orphan ticked trope, so it can be unticked", () => {
    expect(shownTropes(topics, [], ["Unreliable Narrator"]).map(({ name }) => name)).toEqual(["Unreliable Narrator"]);
    expect(shownTropes(topics, ["Romance"], ["Unreliable Narrator"]).map(({ name }) => name)).toEqual([
      "Enemies to Lovers",
      "Unreliable Narrator",
    ]);
  });
});

describe("onlyInUse", () => {
  it("keeps only the names in use, in the curated order, with each trope's genres", () => {
    expect(onlyInUse(topics, { genres: ["Thriller", "Fantasy"], tropes: ["Enemies to Lovers"] })).toEqual({
      genres: ["Fantasy", "Thriller"],
      tropes: [{ name: "Enemies to Lovers", genres: ["Fantasy", "Romance"] }],
    });
  });

  it("drops a name that isn't curated", () => {
    expect(onlyInUse(topics, { genres: ["Made Up"], tropes: [] })).toEqual({ genres: [], tropes: [] });
  });
});
