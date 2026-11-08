import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReadingStatus } from "@/generated/prisma/enums";
import { requireUser } from "@/server/auth/auth.guard";
import { NotFoundError, ValidationError } from "@/server/errors";
import * as libraryService from "@/server/library/library.service";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth/auth.guard");
vi.mock("@/server/library/library.service");

const { addManualBook, changeBookFormats, changeBookStatus, editBook, moveBooks, moveBookWithDates, removeBook, removeBooks } = await import(
  "@/server/library/library.controller"
);
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
      undefined,
      { started: undefined, ended: undefined },
    );
  });

  it("passes the chosen status and names its list", async () => {
    service.addManualBook.mockResolvedValue(added(ReadingStatus.FINISHED, true));
    const state = await addManualBook({}, form({ title: "x", authors: "y", status: "FINISHED" }));
    expect(state.message).toContain("to Finished");
    expect(service.addManualBook).toHaveBeenCalledWith("user-1", { title: "x", authors: ["y"] }, [], "FINISHED", {
      started: undefined,
      ended: undefined,
    });
  });

  it("keeps the chosen status on a rejected form", async () => {
    const state = await addManualBook({}, form({ ...valid, status: "DNF", isbn: "nope" }));
    expect(state.values?.status).toBe("DNF");
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

describe("shelf actions", () => {
  const row = { id: "ub-1", status: ReadingStatus.FINISHED, formats: [] };

  it("changes a status for the signed-in user", async () => {
    service.updateStatus.mockResolvedValue(row as never);
    await expect(changeBookStatus("ub-1", "FINISHED")).resolves.toEqual({ book: row });
    expect(service.updateStatus).toHaveBeenCalledWith("user-1", "ub-1", "FINISHED");
  });

  it("changes formats for the signed-in user", async () => {
    service.updateFormats.mockResolvedValue(row as never);
    await changeBookFormats("ub-1", ["EBOOK"]);
    expect(service.updateFormats).toHaveBeenCalledWith("user-1", "ub-1", ["EBOOK"]);
  });

  it("reports how many books moved and were skipped", async () => {
    service.updateStatuses.mockResolvedValue({ moved: ["a"], skipped: [{ userBookId: "b", reason: "x" }] });
    await expect(moveBooks(["a", "b"], "FINISHED")).resolves.toEqual({ moved: ["a"], skipped: 1 });
  });

  it.each([
    ["a bad status", () => changeBookStatus("ub-1", "LOST" as never)],
    ["an empty id", () => changeBookStatus("", "FINISHED")],
    ["a bad format", () => changeBookFormats("ub-1", ["KINDLE"] as never)],
    ["no books to move", () => moveBooks([], "FINISHED")],
    ["ids that aren't text", () => moveBooks([{}] as never, "FINISHED")],
  ])("rejects %s without calling the service", async (_name, run) => {
    await expect(run()).resolves.toMatchObject({ error: expect.any(String) });
    expect(service.updateStatus).not.toHaveBeenCalled();
    expect(service.updateFormats).not.toHaveBeenCalled();
    expect(service.updateStatuses).not.toHaveBeenCalled();
  });

  it("requires a user on every action", async () => {
    vi.mocked(requireUser).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(changeBookStatus("a", "FINISHED")).rejects.toThrow("NEXT_REDIRECT");
    await expect(changeBookFormats("a", [])).rejects.toThrow("NEXT_REDIRECT");
    await expect(moveBooks(["a"], "FINISHED")).rejects.toThrow("NEXT_REDIRECT");
  });

  it("shows domain errors from a move", async () => {
    service.updateStatus.mockRejectedValueOnce(new NotFoundError("Gone"));
    await expect(changeBookStatus("a", "FINISHED")).resolves.toEqual({ error: "Gone" });
    service.updateStatuses.mockRejectedValueOnce(new Error("bug"));
    await expect(moveBooks(["a"], "FINISHED")).rejects.toThrow("bug");
  });
});

describe("editBook", () => {
  it("edits for the signed-in user and reads every format", async () => {
    service.editUserBook.mockResolvedValue({ id: "ub-1", status: ReadingStatus.READING, formats: ["EBOOK"] } as never);
    const data = form({ status: "READING", pageCount: "310", startedYear: "2026", userBookId: "other" });
    data.append("formats", "EBOOK");
    await expect(editBook("ub-1", data)).resolves.toEqual({
      book: { id: "ub-1", status: ReadingStatus.READING, formats: ["EBOOK"] },
    });
    expect(service.editUserBook).toHaveBeenCalledWith(
      "user-1",
      "ub-1",
      expect.objectContaining({ formats: ["EBOOK"], status: "READING", pageCount: 310 }),
    );
  });

  it("reads authors and cover, with semicolons between authors", async () => {
    service.editUserBook.mockResolvedValue({ id: "ub-1", status: ReadingStatus.WISHLIST, formats: [] } as never);
    await editBook("ub-1", form({ authors: "Ann Lee; Lee, Bo", coverUrl: "https://example.test/c.jpg" }));
    expect(service.editUserBook).toHaveBeenCalledWith(
      "user-1",
      "ub-1",
      expect.objectContaining({ authors: ["Ann Lee", "Lee, Bo"], coverUrl: "https://example.test/c.jpg" }),
    );
  });

  it("treats blank authors and cover as not given", async () => {
    service.editUserBook.mockResolvedValue({ id: "ub-1", status: ReadingStatus.WISHLIST, formats: [] } as never);
    await editBook("ub-1", form({ authors: "", coverUrl: "" }));
    expect(service.editUserBook).toHaveBeenCalledWith(
      "user-1",
      "ub-1",
      expect.objectContaining({ authors: undefined, coverUrl: undefined }),
    );
  });

  it("treats a blank status and page count as not given", async () => {
    service.editUserBook.mockResolvedValue({ id: "ub-1", status: ReadingStatus.WISHLIST, formats: [] } as never);
    await editBook("ub-1", form({ status: "", pageCount: "" }));
    expect(service.editUserBook).toHaveBeenCalledWith(
      "user-1",
      "ub-1",
      expect.objectContaining({ status: undefined, pageCount: undefined }),
    );
  });

  it.each([
    ["a bad page count", { pageCount: "0" }, "Enter a page count of at least 1."],
    ["an http cover", { coverUrl: "http://example.test/c.jpg" }, "The cover URL must start with https://."],
    ["only separators as authors", { authors: " ; ; " }, "Enter at least one author."],
    ["a date after the end", { status: "FINISHED", startedYear: "2025", endedYear: "2024" }, "The start date can't be after the finish date."],
  ])("rejects %s", async (_name, fields, error) => {
    await expect(editBook("ub-1", form(fields))).resolves.toEqual({ error });
    expect(service.editUserBook).not.toHaveBeenCalled();
  });

  it("shows a domain error", async () => {
    service.editUserBook.mockRejectedValue(new NotFoundError("Book not found in your library"));
    await expect(editBook("ub-1", form({}))).resolves.toEqual({ error: "Book not found in your library" });
  });
});

describe("removeBook", () => {
  it("removes for the signed-in user", async () => {
    await expect(removeBook("ub-1")).resolves.toEqual({});
    expect(service.removeUserBook).toHaveBeenCalledWith("user-1", "ub-1");
  });

  it("rejects an invalid id", async () => {
    await expect(removeBook("")).resolves.toEqual({ error: "That request isn't valid." });
    expect(service.removeUserBook).not.toHaveBeenCalled();
  });

  it("shows a domain error", async () => {
    service.removeUserBook.mockRejectedValue(new NotFoundError("Book not found in your library"));
    await expect(removeBook("ub-1")).resolves.toEqual({ error: "Book not found in your library" });
  });
});

describe("moveBookWithDates", () => {
  it("moves for the signed-in user with the chosen dates", async () => {
    service.moveUserBook.mockResolvedValue({ id: "ub-1", status: ReadingStatus.FINISHED, formats: [] } as never);
    const result = await moveBookWithDates("ub-1", ReadingStatus.FINISHED, form({ endedYear: "2025" }));
    expect(result.book?.status).toBe(ReadingStatus.FINISHED);
    expect(service.moveUserBook).toHaveBeenCalledWith(
      "user-1",
      "ub-1",
      ReadingStatus.FINISHED,
      expect.objectContaining({ ended: expect.objectContaining({ precision: "YEAR" }) }),
    );
  });

  it("allows no dates at all", async () => {
    service.moveUserBook.mockResolvedValue({ id: "ub-1", status: ReadingStatus.READING, formats: [] } as never);
    await moveBookWithDates("ub-1", ReadingStatus.READING, form({ startedYear: "" }));
    expect(service.moveUserBook).toHaveBeenCalledWith("user-1", "ub-1", ReadingStatus.READING, {
      started: undefined,
      ended: undefined,
    });
  });

  it("rejects bad dates and statuses without dates", async () => {
    const dates = form({ startedYear: "2025", endedYear: "2024" });
    await expect(moveBookWithDates("ub-1", ReadingStatus.FINISHED, dates)).resolves.toEqual({
      error: "The start date can't be after the finish date.",
    });
    const { error } = await moveBookWithDates("ub-1", ReadingStatus.DNF, form({}));
    expect(error).toBeTruthy();
    expect(service.moveUserBook).not.toHaveBeenCalled();
  });
});

describe("removeBooks", () => {
  it("removes for the signed-in user and reports how many", async () => {
    service.removeUserBooks.mockResolvedValue(2);
    await expect(removeBooks(["ub-1", "ub-2"])).resolves.toEqual({ removed: 2 });
    expect(service.removeUserBooks).toHaveBeenCalledWith("user-1", ["ub-1", "ub-2"]);
  });

  it.each([[[]], [[""]], ["ub-1"]])("rejects an invalid list: %j", async (ids) => {
    await expect(removeBooks(ids as string[])).resolves.toEqual({ error: "That request isn't valid." });
    expect(service.removeUserBooks).not.toHaveBeenCalled();
  });

  it("shows a domain error", async () => {
    service.removeUserBooks.mockImplementation(() => {
      throw new ValidationError("You can delete up to 30 books at once.");
    });
    await expect(removeBooks(["ub-1"])).resolves.toEqual({ error: "You can delete up to 30 books at once." });
  });
});
