import { describe, expect, it } from "vitest";
import { decodeEntities } from "@/server/books/text";

describe("decodeEntities", () => {
  it.each([
    ["&amp;", "&"],
    ["&lt;", "<"],
    ["&gt;", ">"],
    ["&quot;", '"'],
    ["&apos;", "'"],
    ["&nbsp;", " "],
    ["&AMP;", "&"],
  ])("decodes %s", (entity, text) => {
    expect(decodeEntities(`a${entity}b`)).toBe(`a${text}b`);
  });

  it("decodes decimal and hex entities", () => {
    expect(decodeEntities("It&#39;s &#x27;Dune&#X27; &#8212; &#x1F4DA;")).toBe("It's 'Dune' — 📚");
  });

  it("decodes once, so encoded entities stay encoded", () => {
    expect(decodeEntities("Snow &amp;amp; Ash")).toBe("Snow &amp; Ash");
    expect(decodeEntities("&amp;lt;b&amp;gt;")).toBe("&lt;b&gt;");
  });

  it("decodes the imported titles", () => {
    expect(decodeEntities("Storm Shelter: A Sapphic Pirate Fantasy (The Dagger &amp; Tide Trilogy)")).toBe(
      "Storm Shelter: A Sapphic Pirate Fantasy (The Dagger & Tide Trilogy)",
    );
  });

  it.each([
    ["an unknown entity", "&copyx; &foo;"],
    ["a bare ampersand", "Curves & Capital"],
    ["no semicolon", "&amp &#39"],
    ["a null code point", "&#0;"],
    ["a code point past Unicode", "&#x110000; &#9999999;"],
    ["a lone surrogate", "&#xD800; &#57343;"],
    ["too many digits", "&#x1234567;"],
    ["plain text", "The Hobbit"],
  ])("leaves %s as it is", (_name, text) => {
    expect(decodeEntities(text)).toBe(text);
  });

  it("finishes quickly on long hostile input", () => {
    const hostile = `${"&#x".repeat(50_000)}${"&".repeat(50_000)}${"&abcdefgh".repeat(20_000)}`;
    const start = performance.now();
    expect(decodeEntities(hostile)).toBe(hostile);
    expect(performance.now() - start).toBeLessThan(200);
  });
});
