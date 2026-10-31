import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReadingStatus } from "@/generated/prisma/enums";
import { requireUser } from "@/server/auth/auth.guard";
import { NotFoundError } from "@/server/errors";
import * as libraryService from "@/server/library/library.service";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth/auth.guard");
vi.mock("@/server/library/library.service");

const { addManualBook } = await import("@/server/library/library.controller");
const service = vi.mocked(libraryService);

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
};
const valid = { title: "The Hobbit", authors: "J.R.R. Tolkien", formats: "PHYSICAL" };
const added = (status: ReadingStatus, created: boolean) =>
  ({ book: { title: "The Hobbit" }, userBook: { status }, created }) as never;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ id: "user-1" } as never);
});

describe("addManualBook", () => {
  it("adds the book for the signed-in user only", async () => {
    service.addManualBook.mockResolvedValue(added(ReadingStatus.TO_READ, true));
    const state = await addManualBook({}, form({ ...valid, userId: "someone-else" }));
    expect(state).toEqual({ message: "Added “The Hobbit” to TBR." });
    expect(service.addManualBook).toHaveBeenCalledWith(
      "user-1",
      { title: "The Hobbit", authors: ["J.R.R. Tolkien"] },
      ["PHYSICAL"],
    );
  });

  it("names the Wishlist when no format is ticked", async () => {
    service.addManualBook.mockResolvedValue(added(ReadingStatus.WISHLIST, true));
    const state = await addManualBook({}, form({ title: "x", authors: "y" }));
    expect(state.message).toContain("to Wishlist");
  });

  it("says so when the book is already in the library", async () => {
    service.addManualBook.mockResolvedValue(added(ReadingStatus.FINISHED, false));
    const state = await addManualBook({}, form(valid));
    expect(state.message).toContain("already in your library, on Finished");
  });

  it("returns validation errors and what was typed, without calling the service", async () => {
    const state = await addManualBook({}, form({ ...valid, isbn: "nope" }));
    expect(state.error).toBe("That ISBN isn't valid.");
    expect(state.values).toMatchObject({ title: "The Hobbit", isbn: "nope", formats: ["PHYSICAL"] });
    expect(service.addManualBook).not.toHaveBeenCalled();
  });

  it("checks the user before anything else", async () => {
    vi.mocked(requireUser).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(addManualBook({}, form(valid))).rejects.toThrow("NEXT_REDIRECT");
    expect(service.addManualBook).not.toHaveBeenCalled();
  });

  it("shows domain errors and rethrows anything else", async () => {
    service.addManualBook.mockRejectedValueOnce(new NotFoundError("Gone"));
    await expect(addManualBook({}, form(valid))).resolves.toMatchObject({ error: "Gone" });
    service.addManualBook.mockRejectedValueOnce(new Error("bug"));
    await expect(addManualBook({}, form(valid))).rejects.toThrow("bug");
  });
});
