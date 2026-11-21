import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BooksContext, useBooksContext, useLoadedShelf } from "@/components/pages/context";
import { toast } from "@/components/ui/toast";
import { loadShelf } from "@/server/library/library.controller";
import type { ShelfType, UserType } from "@/types";

vi.mock("@/components/ui/toast", () => ({ toast: { add: vi.fn() } }));
vi.mock("@/server/library/library.controller", () => ({ loadShelf: vi.fn() }));
const url = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(url.query) }));

const user = { id: "user-1", email: "reader@example.com" } as UserType;
const shelf = (title: string) => ({ books: [{ id: title }] }) as unknown as ShelfType;
const load = vi.mocked(loadShelf);

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
};

const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => <BooksContext user={user}>{children}</BooksContext>;
const mount = () => renderHook(() => useBooksContext(), { wrapper });

beforeEach(() => {
  vi.clearAllMocks();
  url.query = "shelf=tbr&format=EBOOK&q=dune";
  load.mockResolvedValue({ shelf: shelf("a") });
});

describe("BooksContext", () => {
  it("loads the shelf from the URL's filters and exposes the user", async () => {
    const { result } = mount();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.shelf).toBeNull();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.shelf).toEqual(shelf("a"));
    expect(result.current.user).toBe(user);
    expect(result.current.filters).toMatchObject({ shelf: "tbr", formats: ["EBOOK"], search: "dune" });
    expect(load).toHaveBeenCalledWith({ shelf: "tbr", format: "EBOOK", q: "dune" });
  });

  it("only sends the shelf's own filters", async () => {
    url.query = "shelf=tbr&next=%2Fsettings&utm=x";
    mount();
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    expect(load).toHaveBeenCalledWith({ shelf: "tbr" });
  });

  it("reloads on refresh, keeping the last shelf while it loads", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.shelf).toEqual(shelf("a")));
    const next = deferred<{ shelf: ShelfType }>();
    load.mockReturnValueOnce(next.promise);
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    expect(result.current.shelf).toEqual(shelf("a"));
    await act(async () => next.resolve({ shelf: shelf("b") }));
    expect(result.current.shelf).toEqual(shelf("b"));
    expect(result.current.isLoading).toBe(false);
  });

  it("ignores a slow load that a newer one replaced", async () => {
    const slow = deferred<{ shelf: ShelfType }>();
    load.mockReturnValueOnce(slow.promise).mockResolvedValueOnce({ shelf: shelf("new") });
    const { result } = mount();
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.shelf).toEqual(shelf("new")));
    await act(async () => slow.resolve({ shelf: shelf("old") }));
    expect(result.current.shelf).toEqual(shelf("new"));
  });

  it("shows the server's error", async () => {
    load.mockResolvedValue({ error: "Too many requests." });
    const { result } = mount();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.shelf).toBeNull();
    expect(toast.add).toHaveBeenCalledWith({ description: "Too many requests.", type: "error" });
  });

  it("says so when the shelf can't be loaded at all", async () => {
    load.mockRejectedValue(new Error("network"));
    const { result } = mount();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(toast.add).toHaveBeenCalledWith({ description: "Your books couldn't be loaded. Try again.", type: "error" });
  });

  it("renders its children", async () => {
    render(<BooksContext user={user}>Shelf page</BooksContext>);
    expect(screen.getByText("Shelf page")).toBeTruthy();
    await waitFor(() => expect(load).toHaveBeenCalled());
  });
});

describe("useBooksContext", () => {
  it("throws outside BooksContext", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useBooksContext())).toThrow("must be used within a BooksContext");
    vi.mocked(console.error).mockRestore();
  });
});

describe("useLoadedShelf", () => {
  it("returns the shelf once loaded", async () => {
    const Loaded = () => <p>{useLoadedShelf().shelf.books.length} books</p>;
    // Pages mount their shelf only after the first load, as this gate does.
    const Gate = () => (useBooksContext().shelf ? <Loaded /> : null);
    render(<Gate />, { wrapper });
    expect(await screen.findByText("1 books")).toBeTruthy();
  });

  it("throws before the shelf has loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    load.mockReturnValue(new Promise(() => {}));
    expect(() => renderHook(() => useLoadedShelf(), { wrapper })).toThrow("needs the shelf to have loaded");
    vi.mocked(console.error).mockRestore();
  });
});
