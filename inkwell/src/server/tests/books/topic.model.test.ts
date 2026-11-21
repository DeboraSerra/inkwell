import { describe, expect, it, vi } from "vitest";

const genreFindMany = vi.fn(async (_args: unknown) => [{ name: "Fantasy" }, { name: "Romance" }]);
const tropeFindMany = vi.fn(async (_args: unknown) => [
  { name: "Enemies to Lovers", genres: [{ genre: { name: "Romance" } }, { genre: { name: "Fantasy" } }] },
]);
vi.mock("@/server/db", () => ({
  prisma: { genre: { findMany: genreFindMany }, trope: { findMany: tropeFindMany } },
}));

const model = await import("@/server/books/topic.model");

describe("listTopicNames", () => {
  it("lists every genre, and every trope with its genres, alphabetically", async () => {
    await expect(model.listTopicNames()).resolves.toEqual({
      genres: ["Fantasy", "Romance"],
      tropes: [{ name: "Enemies to Lovers", genres: ["Romance", "Fantasy"] }],
    });
    expect(genreFindMany).toHaveBeenCalledWith({ select: { name: true }, orderBy: { name: "asc" } });
    expect(tropeFindMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { name: "asc" } }));
  });
});
