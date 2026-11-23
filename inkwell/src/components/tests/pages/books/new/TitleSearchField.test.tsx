import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TitleSearchField } from "@/components/pages/books/new/TitleSearchField";
import { previewSearchResult } from "@/server/library/library.controller";
import type { IsbnPreview, SearchResult } from "@/types/books.type";
import { expectAccessible } from "../../../a11y";

vi.mock("@/server/library/library.controller", () => ({ previewSearchResult: vi.fn() }));
vi.mock("@/components/common/BookCover", () => ({ BookCover: () => null }));

const results: SearchResult[] = [
  { source: "OPEN_LIBRARY", sourceId: "OL1W", title: "Dune", authors: ["Frank Herbert"], publishedYear: 1965 },
  { source: "GOOGLE_BOOKS", sourceId: "g2", title: "Dune Messiah", authors: [], inLibrary: "FINISHED" },
];
const preview: IsbnPreview = { title: "Dune", authors: ["Frank Herbert"], from: "OPEN_LIBRARY" };
const title = () => screen.getByRole("combobox", { name: /^Title/ }) as HTMLInputElement;
const respond = (status: number, body: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
const show = () => {
  const onFound = vi.fn();
  render(<TitleSearchField id='title' invalid={false} onFound={onFound} />);
  return onFound;
};

beforeEach(() => {
  vi.clearAllMocks();
  respond(200, { results });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TitleSearchField", () => {
  it("searches once typing pauses, from three characters", async () => {
    show();
    await expectAccessible();
    await userEvent.type(title(), "du");
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(fetch).not.toHaveBeenCalled();
    await userEvent.type(title(), "ne");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/books/search?q=dune");
  });

  it("lists the results, marking a book already in the library", async () => {
    show();
    await userEvent.type(title(), "dune");
    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "DuneFrank Herbert1965",
      "Dune MessiahIn your library · Finished",
    ]);
    await expectAccessible();
  });

  it("opens a picked result and hands it on with the typed title", async () => {
    vi.mocked(previewSearchResult).mockResolvedValue({ preview });
    const onFound = show();
    await userEvent.type(title(), "dune");
    await userEvent.click(await screen.findByRole("option", { name: /Frank Herbert/ }));
    await waitFor(() => expect(onFound).toHaveBeenCalledWith(preview, "dune"));
    expect(previewSearchResult).toHaveBeenCalledWith({ source: "OPEN_LIBRARY", sourceId: "OL1W" });
  });

  it("says when a picked result can't be opened", async () => {
    vi.mocked(previewSearchResult).mockResolvedValue({ error: "That book couldn't be found." });
    const onFound = show();
    await userEvent.type(title(), "dune");
    await userEvent.click(await screen.findByRole("option", { name: /Frank Herbert/ }));
    expect(await screen.findByText("That book couldn't be found.")).toBeTruthy();
    expect(onFound).not.toHaveBeenCalled();
    expect(title().getAttribute("aria-invalid")).toBe("true");
  });

  it("says when nothing is found", async () => {
    respond(200, { results: [] });
    show();
    await userEvent.type(title(), "zzzz");
    expect(await screen.findByText(/No books found/)).toBeTruthy();
  });

  it("shows the server's error", async () => {
    respond(429, { error: "Too many lookups. Try again in a minute." });
    show();
    await userEvent.type(title(), "dune");
    expect((await screen.findAllByText("Too many lookups. Try again in a minute.")).length).toBeGreaterThan(0);
  });

  it("says when the search can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    show();
    await userEvent.type(title(), "dune");
    expect((await screen.findAllByText(/Check your connection/)).length).toBeGreaterThan(0);
  });

  it("keeps the typed title in the form for a manual add, and Enter doesn't submit", async () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <TitleSearchField id='title' defaultValue='My notes' invalid={false} onFound={vi.fn()} />
      </form>,
    );
    expect(title().value).toBe("My notes");
    expect(title().name).toBe("title");
    await userEvent.type(title(), "{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
