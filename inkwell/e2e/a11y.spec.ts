import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { AUTH_STATE } from "./global-setup";

// WCAG 2.2 A and AA, plus axe's best practices for landmarks and headings,
// which a component rendered alone in jsdom can't be checked for.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const found = violations.map((violation) =>
    [`${violation.id}: ${violation.help}`, ...violation.nodes.map((node) => `  ${node.target.join(" ")}  ${node.html}\n    ${node.failureSummary?.replaceAll("\n", " ") ?? ""}`)].join("\n"),
  );
  expect(found.join("\n\n"), "axe found accessibility violations").toBe("");
}

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await expectAccessible(page);
  });

  test("privacy", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectAccessible(page);
  });
});

test.describe("signed in", () => {
  test.use({ storageState: AUTH_STATE });

  const openShelf = async (page: Page, slug: string) => {
    await page.goto(`/books/shelves?shelf=${slug}`);
    await expect(page.getByRole("button", { name: /^Actions for / }).first()).toBeVisible();
  };

  test("home", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /^Welcome/ })).toBeVisible();
    await expectAccessible(page);
  });

  for (const slug of ["tbr", "wishlist", "reading", "finished", "dnf", "owned"]) {
    test(`shelf: ${slug}`, async ({ page }) => {
      await openShelf(page, slug);
      await expectAccessible(page);
    });
  }

  test("shelf: filter popover open", async ({ page }) => {
    await openShelf(page, "tbr");
    await page.getByRole("button", { name: /^Filter books/ }).click();
    await expect(page.getByRole("list", { name: "Genres" })).toBeVisible();
    await expectAccessible(page);
  });

  test("shelf: edit dialog open", async ({ page }) => {
    await openShelf(page, "tbr");
    await page.getByRole("button", { name: /^Actions for / }).first().click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectAccessible(page);
  });

  test("add a book", async ({ page }) => {
    await page.goto("/books/new");
    await expect(page.getByRole("heading", { name: "Add a book" })).toBeVisible();
    await expectAccessible(page);
  });

  test("settings", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("tab", { name: "Profile" })).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("tab", { name: "Extension tokens" }).click();
    await expect(page.getByRole("tab", { name: "Extension tokens" })).toHaveAttribute("aria-selected", "true");
    await expectAccessible(page);
  });
});
