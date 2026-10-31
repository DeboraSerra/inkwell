import { describe, expect, it } from "vitest";
import { dedupeKey, normalizeAuthor, normalizeTitle } from "@/server/books/dedupe";

describe("normalizeTitle", () => {
  it("ignores leading and trailing articles", () => {
    expect(normalizeTitle("The Hobbit")).toBe("hobbit");
    expect(normalizeTitle("Hobbit, The")).toBe("hobbit");
    expect(normalizeTitle("A Court of Thorns and Roses")).toBe("court of thorns and roses");
  });

  it("drops subtitles", () => {
    expect(normalizeTitle("Fourth Wing: A Novel")).toBe("fourth wing");
    expect(normalizeTitle("Fourth Wing: Special Edition")).toBe("fourth wing");
  });

  it("drops series and edition markers", () => {
    expect(normalizeTitle("Fourth Wing (The Empyrean Book 1)")).toBe("fourth wing");
    expect(normalizeTitle("Iron Flame [Kindle Edition]")).toBe("iron flame");
  });

  it("ignores case, accents and punctuation", () => {
    expect(normalizeTitle("Memórias Póstumas de Brás Cubas")).toBe(
      "memorias postumas de bras cubas",
    );
    expect(normalizeTitle("  Pride   and Prejudice!  ")).toBe("pride and prejudice");
    expect(normalizeTitle("Pride & Prejudice")).toBe("pride and prejudice");
  });

  it("keeps an article that is the whole title", () => {
    expect(normalizeTitle("It")).toBe("it");
  });
});

describe("normalizeAuthor", () => {
  it("reduces names to the surname in any format", () => {
    expect(normalizeAuthor("J.R.R. Tolkien")).toBe("tolkien");
    expect(normalizeAuthor("J. R. R. Tolkien")).toBe("tolkien");
    expect(normalizeAuthor("Tolkien, J. R. R.")).toBe("tolkien");
  });

  it("ignores accents and name suffixes", () => {
    expect(normalizeAuthor("Machado de Assis")).toBe("assis");
    expect(normalizeAuthor("Gabriel García Márquez")).toBe("marquez");
    expect(normalizeAuthor("Martin Luther King Jr.")).toBe("king");
  });

  it("handles an empty name", () => {
    expect(normalizeAuthor("")).toBe("");
  });
});

describe("dedupeKey", () => {
  it("matches the same book written differently", () => {
    expect(dedupeKey("The Hobbit", ["J.R.R. Tolkien"])).toBe(
      dedupeKey("Hobbit, The", ["Tolkien, J. R. R."]),
    );
    expect(dedupeKey("Fourth Wing (The Empyrean Book 1)", ["Rebecca Yarros"])).toBe(
      dedupeKey("Fourth Wing: Special Edition", ["Rebecca Yarros", "Someone Else"]),
    );
  });

  it("separates different books", () => {
    expect(dedupeKey("Fourth Wing", ["Rebecca Yarros"])).not.toBe(
      dedupeKey("Iron Flame", ["Rebecca Yarros"]),
    );
    expect(dedupeKey("Emma", ["Jane Austen"])).not.toBe(dedupeKey("Emma", ["Someone Else"]));
  });

  it("uses only the first author", () => {
    expect(dedupeKey("Good Omens", ["Terry Pratchett", "Neil Gaiman"])).toBe(
      "good omens|pratchett",
    );
  });

  it("works without authors", () => {
    expect(dedupeKey("Anonymous Book", [])).toBe("anonymous book|");
  });
});
