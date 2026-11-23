import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { withSidebar } from "./sidebar-wrapper";
import { expectAccessible } from "../a11y";

const path = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.current }));
vi.mock("next/link", () => ({ default: (props: Record<string, unknown>) => <a {...props} /> }));

describe("MobileTabBar", () => {
  it("links the main pages, marking the current one", async () => {
    path.current = "/books/shelves";
    render(<MobileTabBar />, { wrapper: withSidebar });
    const nav = screen.getByRole("navigation", { name: "Main" });
    const links = [...nav.querySelectorAll("a")].map((link) => `${link.textContent} ${link.getAttribute("href")}`);
    expect(links).toEqual(["Home /", "Shelves /books/shelves", "Add /books/new"]);
    expect(screen.getByRole("link", { name: "Shelves" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBeNull();
    await expectAccessible();
  });

  it("opens and closes the sidebar drawer from More", async () => {
    render(<MobileTabBar />, { wrapper: withSidebar });
    const more = screen.getByRole("button", { name: "More" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    await expectAccessible();
    await userEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("false");
  });
});
