import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppSidebar } from "@/components/layout/Sidebar";
import { withSidebar } from "../sidebar-wrapper";
import { expectAccessible } from "../../a11y";

vi.mock("next/link", () => ({ default: (props: Record<string, unknown>) => <a {...props} /> }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/components/layout/Sidebar/Content", () => ({ Content: () => <p>Content</p> }));
vi.mock("@/components/layout/Sidebar/Footer", () => ({ Footer: () => <p>Footer</p> }));

describe("AppSidebar", () => {
  it("links home from the logo, above the content and the account footer", async () => {
    render(<AppSidebar />, { wrapper: withSidebar });
    expect(screen.getByRole("link", { name: "Inkwell" }).getAttribute("href")).toBe("/");
    expect(screen.getByText("Content")).toBeTruthy();
    expect(screen.getByText("Footer")).toBeTruthy();
    await expectAccessible();
  });

  it("is a landmark holding the logo, the links and the account", () => {
    render(<AppSidebar />, { wrapper: withSidebar });
    const sidebar = within(screen.getByRole("navigation", { name: "Sidebar" }));
    expect(sidebar.getByRole("link", { name: "Inkwell" })).toBeTruthy();
    expect(sidebar.getByText("Content")).toBeTruthy();
    expect(sidebar.getByText("Footer")).toBeTruthy();
  });
});
