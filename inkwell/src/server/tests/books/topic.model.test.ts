import { describe, expect, it, vi } from "vitest";

const genreFindMany = vi.fn(async (_args: unknown) => [{ name: "Fantasy" }, { name: "Romance" }]);
const tropeFindMany = vi.fn(async (_args: unknown) => [
  { name: "Enemies to Lovers", genres: [{ genre: { name: "Romance" } }, { genre: { name: "Fantasy" } }] },
]);
const findUnique = vi.fn(async (_args: unknown) => ({ id: "shared-client" }));
vi.mock("@/server/db", () => ({
  prisma: { genre: { findMany: genreFindMany, findUnique }, trope: { findMany: tropeFindMany, findUnique } },
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

describe("findGenreId and findTropeId", () => {
  const db = (row: { id: string } | null) => {
    const txFindUnique = vi.fn(async (_args: unknown) => row);
    return { db: { genre: { findUnique: txFindUnique }, trope: { findUnique: txFindUnique } } as never, findUnique: txFindUnique };
  };

  it("return the id for a curated name", async () => {
    const genre = db({ id: "g1" });
    await expect(model.findGenreId("Fantasy", genre.db)).resolves.toBe("g1");
    expect(genre.findUnique).toHaveBeenCalledWith({ where: { name: "Fantasy" }, select: { id: true } });
    await expect(model.findTropeId("Chosen One", db({ id: "t1" }).db)).resolves.toBe("t1");
  });

  it("return null for a name that isn't on the lists", async () => {
    await expect(model.findGenreId("Cooking", db(null).db)).resolves.toBeNull();
    await expect(model.findTropeId("Time Loop", db(null).db)).resolves.toBeNull();
  });

  it("use the shared client by default", async () => {
    await expect(model.findGenreId("Fantasy")).resolves.toBe("shared-client");
    await expect(model.findTropeId("Chosen One")).resolves.toBe("shared-client");
  });
});
