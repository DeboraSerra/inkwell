import { describe, expect, it } from "vitest";
import { authorSearchText, dedupeKey, normalizeAuthor, normalizeTitle, splitAmazonAuthors } from "@/server/books/dedupe";

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
      dedupeKey("Fourth Wing: Special Edition", ["Yarros, Rebecca"]),
    );
  });

  it("ignores the order of the authors", () => {
    expect(dedupeKey("Good Omens", ["Terry Pratchett", "Neil Gaiman"])).toBe(
      dedupeKey("Good Omens", ["Neil Gaiman", "Terry Pratchett"]),
    );
  });

  it("separates different books", () => {
    expect(dedupeKey("Fourth Wing", ["Rebecca Yarros"])).not.toBe(
      dedupeKey("Iron Flame", ["Rebecca Yarros"]),
    );
    expect(dedupeKey("Emma", ["Jane Austen"])).not.toBe(dedupeKey("Emma", ["Someone Else"]));
  });

  it("uses every author's surname, sorted", () => {
    expect(dedupeKey("Good Omens", ["Terry Pratchett", "Neil Gaiman"])).toBe(
      "good omens|gaiman,pratchett",
    );
  });

  it("works without authors", () => {
    expect(dedupeKey("Anonymous Book", [])).toBe("anonymous book|");
  });
});

describe("authorSearchText", () => {
  it("holds every author's name in natural order", () => {
    expect(authorSearchText(["Tolkien, J. R. R.", "Gabriel García Márquez"])).toBe(
      "|j r r tolkien|gabriel garcia marquez|",
    );
  });

  it("is empty without authors", () => {
    expect(authorSearchText([])).toBe("");
  });
});

describe("splitAmazonAuthors", () => {
  it("splits names separated by commas", () => {
    expect(splitAmazonAuthors("Kerrigan Byrne, Cynthia St. Aubin")).toEqual(["Kerrigan Byrne", "Cynthia St. Aubin"]);
    expect(splitAmazonAuthors("Ann Lee, Bo Kim, Cy Young")).toEqual(["Ann Lee", "Bo Kim", "Cy Young"]);
  });

  it("keeps a surname-first name whole", () => {
    expect(splitAmazonAuthors("Tolkien, J. R. R.")).toEqual(["Tolkien, J. R. R."]);
    expect(splitAmazonAuthors("Yarros, Rebecca; Doe, Jane")).toEqual(["Yarros, Rebecca", "Doe, Jane"]);
  });

  it("keeps a name suffix with its name", () => {
    expect(splitAmazonAuthors("Martin Luther King, Jr., Ann Lee")).toEqual(["Martin Luther King, Jr.", "Ann Lee"]);
  });

  it("keeps a single name as it is", () => {
    expect(splitAmazonAuthors("Rebecca Yarros")).toEqual(["Rebecca Yarros"]);
  });
});
