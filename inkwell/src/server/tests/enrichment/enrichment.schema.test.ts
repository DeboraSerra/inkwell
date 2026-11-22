import { describe, expect, it } from "vitest";
import { enrichmentReplySchema } from "@/server/enrichment/enrichment.schema";

const valid = { genres: ["Fantasy"], tropes: ["Enemies to Lovers"], tags: ["fae"] };
const many = (n: number) => Array.from({ length: n }, (_, i) => `x${i}`);

describe("enrichmentReplySchema", () => {
  it("accepts a reply without a length category", () => {
    expect(enrichmentReplySchema.parse(valid)).toEqual(valid);
  });

  it.each(["NOVELLA", "SHORT", "MEDIUM", "LONG"])("accepts the length category %s", (lengthCategory) => {
    expect(enrichmentReplySchema.parse({ ...valid, lengthCategory }).lengthCategory).toBe(lengthCategory);
  });

  it("accepts empty genres and tropes", () => {
    expect(enrichmentReplySchema.safeParse({ ...valid, genres: [], tropes: [] }).success).toBe(true);
  });

  it("accepts 50 of each", () => {
    expect(enrichmentReplySchema.safeParse({ genres: many(50), tropes: many(50), tags: many(50) }).success).toBe(true);
  });

  it.each([
    ["no tags", { ...valid, tags: [] }],
    ["51 genres", { ...valid, genres: many(51) }],
    ["51 tropes", { ...valid, tropes: many(51) }],
    ["51 tags", { ...valid, tags: many(51) }],
    ["an unknown length category", { ...valid, lengthCategory: "EPIC" }],
    ["a non-string tag", { ...valid, tags: [1] }],
    ["missing genres", { tropes: [], tags: ["fae"] }],
    ["missing tropes", { genres: [], tags: ["fae"] }],
    ["a string instead of a list", { ...valid, genres: "Fantasy" }],
    ["null", null],
  ])("rejects %s", (_label, reply) => {
    expect(enrichmentReplySchema.safeParse(reply).success).toBe(false);
  });
});
