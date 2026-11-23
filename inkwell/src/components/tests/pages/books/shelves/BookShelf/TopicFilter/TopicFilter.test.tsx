import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TopicFilter } from "@/components/pages/books/shelves/BookShelf/TopicFilter";
import { rememberTopicScope } from "@/server/library/library.controller";

vi.mock("@/server/library/library.controller", () => ({ rememberTopicScope: vi.fn() }));
import type { TopicLists } from "@/types/shelf.type";
import { expectAccessible } from "../../../../../a11y";

const topics: TopicLists = {
  genres: ["Fantasy", "Romance", "Thriller"],
  tropes: [
    { name: "Chosen One", genres: ["Fantasy"] },
    { name: "Enemies to Lovers", genres: ["Fantasy", "Romance"] },
    { name: "Unreliable Narrator", genres: ["Thriller"] },
  ],
};

// The reader's books have only Romance, with its one trope.
const library = { genres: ["Romance"], tropes: ["Enemies to Lovers"] };

const open = async (genres: string[] = [], tropes: string[] = []) => {
  const onChange = vi.fn();
  render(<TopicFilter topics={topics} libraryTopics={library} onlyMine={false} genres={genres} tropes={tropes} onChange={onChange} />);
  await userEvent.click(screen.getByRole("button", { name: /^Filter books/ }));
  return onChange;
};
const chips = (list: string) =>
  within(screen.getByRole("list", { name: list }))
    .getAllByRole("button")
    .map((chip) => chip.textContent?.trim());

describe("TopicFilter", () => {
  it("lists every genre and asks for one before showing tropes", async () => {
    await open();
    expect(chips("Genres")).toEqual(["Fantasy", "Romance", "Thriller"]);
    expect(screen.queryByRole("list", { name: "Tropes" })).toBeNull();
    expect(screen.getByText("No genre selected")).toBeTruthy();
    await expectAccessible();
  });

  it("ticks a genre", async () => {
    const onChange = await open([], []);
    await userEvent.click(screen.getByRole("button", { name: "Fantasy" }));
    expect(onChange).toHaveBeenCalledWith(["Fantasy"], []);
  });

  it("unticks a ticked genre, which shows as pressed", async () => {
    const onChange = await open(["Fantasy", "Romance"], []);
    const fantasy = screen.getByRole("button", { name: "Fantasy" });
    expect(fantasy.getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(fantasy);
    expect(onChange).toHaveBeenCalledWith(["Romance"], []);
  });

  it("clears every trope when the last genre is unticked", async () => {
    const onChange = await open(["Fantasy"], ["Chosen One"]);
    await userEvent.click(screen.getByRole("button", { name: "Fantasy" }));
    expect(onChange).toHaveBeenCalledWith([], []);
  });

  it("unticking one genre of several keeps the tropes the others have", async () => {
    const onChange = await open(["Fantasy", "Romance"], ["Chosen One", "Enemies to Lovers"]);
    await userEvent.click(screen.getByRole("button", { name: "Fantasy" }));
    expect(onChange).toHaveBeenCalledWith(["Romance"], ["Enemies to Lovers"]);
  });

  it("still shows a ticked trope with no genre ticked, so it can be unticked", async () => {
    const onChange = await open([], ["Chosen One"]);
    expect(chips("Tropes")).toEqual(["Chosen One"]);
    await userEvent.click(screen.getByRole("button", { name: "Chosen One" }));
    expect(onChange).toHaveBeenCalledWith([], []);
  });

  it("only shows the ticked genres' tropes", async () => {
    await open(["Romance"], []);
    expect(chips("Tropes")).toEqual(["Enemies to Lovers"]);
    await expectAccessible();
  });

  it("keeps a ticked trope from another genre, so it can be unticked", async () => {
    const onChange = await open(["Romance"], ["Unreliable Narrator"]);
    expect(chips("Tropes")).toEqual(["Enemies to Lovers", "Unreliable Narrator"]);
    await userEvent.click(screen.getByRole("button", { name: "Unreliable Narrator" }));
    expect(onChange).toHaveBeenCalledWith(["Romance"], []);
  });

  it("ticks a trope, keeping the genres", async () => {
    const onChange = await open(["Fantasy"], []);
    await userEvent.click(screen.getByRole("button", { name: "Chosen One" }));
    expect(onChange).toHaveBeenCalledWith(["Fantasy"], ["Chosen One"]);
  });

  it("counts what's ticked and clears it all", async () => {
    const onChange = vi.fn();
    render(<TopicFilter topics={topics} libraryTopics={library} onlyMine={false} genres={["Fantasy"]} tropes={["Chosen One"]} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Filter books, 2 selected" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onChange).toHaveBeenCalledWith([], []);
  });

  it("has nothing to clear with nothing ticked", () => {
    render(<TopicFilter topics={topics} libraryTopics={library} onlyMine={false} genres={[]} tropes={[]} onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
    expect(screen.getByRole("button", { name: "Filter books" })).toBeTruthy();
  });

  it("says so when the ticked genres have no tropes", async () => {
    await open(["Horror"], []);
    expect(screen.getByText("No tropes for these genres.")).toBeTruthy();
  });

  describe("only genres in my books", () => {
    const openMine = async (genres: string[] = [], tropes: string[] = []) => {
      vi.mocked(rememberTopicScope).mockResolvedValue({});
      render(<TopicFilter topics={topics} libraryTopics={library} onlyMine genres={genres} tropes={tropes} onChange={vi.fn()} />);
      await userEvent.click(screen.getByRole("button", { name: /^Filter books/ }));
    };

    it("lists only the reader's genres and tropes when on", async () => {
      await openMine(["Romance", "Fantasy"]);
      expect((screen.getByRole("switch", { name: "Only genres in my books" }) as HTMLElement).getAttribute("aria-checked")).toBe("true");
      // Fantasy isn't in the reader's books, but it's ticked, so it can be unticked.
      expect(chips("Genres")).toEqual(["Fantasy", "Romance"]);
      expect(chips("Tropes")).toEqual(["Enemies to Lovers"]);
    });

    it("lists every curated genre once switched off, and remembers it", async () => {
      await openMine();
      expect(chips("Genres")).toEqual(["Romance"]);
      await userEvent.click(screen.getByRole("switch", { name: "Only genres in my books" }));
      expect(chips("Genres")).toEqual(["Fantasy", "Romance", "Thriller"]);
      expect(rememberTopicScope).toHaveBeenCalledWith(false);
    });

    it("still switches when saving the choice fails", async () => {
      await openMine();
      vi.mocked(rememberTopicScope).mockRejectedValue(new Error("offline"));
      await userEvent.click(screen.getByRole("switch", { name: "Only genres in my books" }));
      expect(chips("Genres")).toEqual(["Fantasy", "Romance", "Thriller"]);
    });
  });
});
