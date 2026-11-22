import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShelfFilterBar } from "@/components/pages/books/shelves/BookShelf/ShelfFilterBar";
import { parseShelfFilters, searchParamsRecord } from "@/server/library/shelf-filters";
import type { ShelfFilters, TopicLists } from "@/types/shelf.type";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
// The sort menu reads the shelf from the context; it isn't what's tested here.
vi.mock("@/server/library/library.controller", () => ({ rememberTopicScope: vi.fn() }));
vi.mock("@/components/pages/books/shelves/BookShelf/ShelfOrderControls", () => ({ ShelfOrderControls: () => null }));

const topics: TopicLists = { genres: ["Fantasy"], tropes: [{ name: "Chosen One", genres: ["Fantasy"] }] };
const filtersFor = (query: string) => parseShelfFilters(searchParamsRecord(new URLSearchParams(query)));
const searchBox = () => screen.getByRole("searchbox", { name: /Search by title/ }) as HTMLInputElement;
// fireEvent rather than user-event: Testing Library's async wrapper waits on a
// real setTimeout, which fake timers never run.
const type = (value: string) => fireEvent.change(searchBox(), { target: { value } });
const enter = () => fireEvent.submit(searchBox().form as HTMLFormElement);
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const mount = (filters: ShelfFilters) => render(<ShelfFilterBar filters={filters} topics={topics} libraryTopics={{ genres: [], tropes: [] }} onlyMyTopics={false} />);

beforeEach(() => {
  // Only the search delay: React and Base UI schedule their own work on the other timers.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ShelfFilterBar search", () => {
  it("searches once typing pauses, replacing the history entry", () => {
    mount(filtersFor("shelf=tbr"));
    type("dune");
    wait(499);
    expect(router.replace).not.toHaveBeenCalled();
    wait(1);
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith("/books/shelves?shelf=tbr&q=dune");
  });

  it("searches straight away on Enter", () => {
    mount(filtersFor("shelf=tbr"));
    type("dune");
    enter();
    expect(router.replace).toHaveBeenCalledWith("/books/shelves?shelf=tbr&q=dune");
    wait(500);
    expect(router.replace).toHaveBeenCalledTimes(1);
  });

  it("keeps the shelf's formats and topics in the search", () => {
    mount(filtersFor("shelf=finished&format=EBOOK&genre=Fantasy"));
    type("dune");
    enter();
    expect(router.replace).toHaveBeenCalledWith("/books/shelves?shelf=finished&format=EBOOK&genre=Fantasy&q=dune");
  });

  it("shows the whole shelf at once when the ✕ clears the box", () => {
    mount(filtersFor("shelf=tbr&q=dune"));
    expect(searchBox().value).toBe("dune");
    fireEvent.click(screen.getByRole("button", { name: "Clear the search" }));
    expect(router.replace).toHaveBeenCalledWith("/books/shelves?shelf=tbr");
    expect(searchBox().value).toBe("");
    expect(document.activeElement).toBe(searchBox());
    expect(screen.queryByRole("button", { name: "Clear the search" })).toBeNull();
  });

  it("shows the whole shelf at once when the text is deleted", () => {
    mount(filtersFor("shelf=tbr&q=dune"));
    type("");
    expect(router.replace).toHaveBeenCalledWith("/books/shelves?shelf=tbr");
  });

  it("doesn't search again for the search already showing", () => {
    mount(filtersFor("shelf=tbr&q=dune"));
    type("dune ");
    enter();
    wait(500);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("shows a search changed from outside", () => {
    const { rerender } = mount(filtersFor("shelf=tbr&q=dune"));
    rerender(<ShelfFilterBar filters={filtersFor("shelf=tbr&q=emma")} topics={topics} libraryTopics={{ genres: [], tropes: [] }} onlyMyTopics={false} />);
    expect(searchBox().value).toBe("emma");
  });

  it("runs a pending search on the filters showing when it fires", () => {
    const { rerender } = mount(filtersFor("shelf=tbr"));
    type("dune");
    rerender(<ShelfFilterBar filters={filtersFor("shelf=tbr&format=AUDIO")} topics={topics} libraryTopics={{ genres: [], tropes: [] }} onlyMyTopics={false} />);
    wait(500);
    expect(router.replace).toHaveBeenCalledWith("/books/shelves?shelf=tbr&format=AUDIO&q=dune");
  });

  it("works without JavaScript through hidden fields", () => {
    mount(filtersFor("shelf=finished&format=EBOOK&format=AUDIO&genre=Fantasy&trope=Chosen+One"));
    const form = searchBox().form as HTMLFormElement;
    expect(form.getAttribute("action")).toBe("/books/shelves");
    expect(form.getAttribute("method")).toBe("get");
    const hidden = [...form.querySelectorAll<HTMLInputElement>("input[type=hidden]")].map(
      ({ name, value }) => `${name}=${value}`,
    );
    expect(hidden).toEqual(["shelf=finished", "format=EBOOK", "format=AUDIO", "genre=Fantasy", "trope=Chosen One"]);
  });
});

describe("ShelfFilterBar formats and topics", () => {
  it("adds a ticked format, keeping what's typed but not searched yet", () => {
    mount(filtersFor("shelf=tbr&format=EBOOK"));
    type("dune");
    fireEvent.click(screen.getByRole("checkbox", { name: "Physical" }));
    expect(router.push).toHaveBeenCalledWith("/books/shelves?shelf=tbr&format=EBOOK&format=PHYSICAL&q=dune");
    // The typed search went with it, so the timer doesn't search again.
    wait(500);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("removes an unticked format", () => {
    mount(filtersFor("shelf=tbr&format=EBOOK&format=AUDIO"));
    fireEvent.click(screen.getByRole("checkbox", { name: "Ebook" }));
    expect(router.push).toHaveBeenCalledWith("/books/shelves?shelf=tbr&format=AUDIO");
  });

  it("changes the genres and tropes through the topic filter", async () => {
    // findByRole polls on a real timer.
    vi.useRealTimers();
    mount(filtersFor("shelf=tbr&per=20"));
    fireEvent.click(screen.getByRole("button", { name: "Filter books" }));
    fireEvent.click(await screen.findByRole("button", { name: "Fantasy" }));
    expect(router.push).toHaveBeenCalledWith("/books/shelves?shelf=tbr&genre=Fantasy&per=20");
  });
});
