import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

// The Chrome extension's two screens (Phase 8d), outside Chrome: the options
// page from its file, and the import dialog injected into a stand-in for
// Amazon's page, with the extension APIs they call stubbed.

const EXTENSION = fileURLToPath(new URL("../../extension/", import.meta.url));
const AMAZON_PAGE = "https://www.amazon.com/hz/mycd/digital-console/contentlist/booksAll/dateDsc/";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function expectAccessible(page: Page, include?: string) {
  const builder = new AxeBuilder({ page }).withTags(TAGS);
  if (include) builder.include(include);
  const { violations } = await builder.analyze();
  const found = violations.map((violation) =>
    [`${violation.id}: ${violation.help}`, ...violation.nodes.map((node) => `  ${node.target.join(" ")}  ${node.failureSummary?.replaceAll("\n", " ") ?? ""}`)].join("\n"),
  );
  expect(found.join("\n\n"), "axe found accessibility violations").toBe("");
}

test.describe("extension options page", () => {
  // `reply` is what the stubbed /api/me answers with: an email, or a status.
  const openOptions = async (page: Page, reply: { email: string } | { status: number }) => {
    await page.addInitScript((answer) => {
      Object.assign(globalThis, {
        chrome: {
          storage: { local: { get: async () => ({}), set: async () => undefined } },
          permissions: { contains: async () => true, request: async () => true },
        },
        fetch: async () =>
          "email" in answer ? Response.json({ email: answer.email }) : new Response(null, { status: answer.status }),
      });
    }, reply);
    await page.goto(`file://${EXTENSION}options.html`);
    await expect(page.getByRole("heading", { name: "Inkwell Kindle import" })).toBeVisible();
  };

  const save = async (page: Page) => {
    await page.getByLabel("API token").fill("ink_test");
    await page.getByRole("button", { name: "Save and test" }).click();
  };

  for (const colorScheme of ["light", "dark"] as const) {
    test.describe(`in ${colorScheme}`, () => {
      test.use({ colorScheme });

      test("empty", async ({ page }) => {
        await openOptions(page, { email: "reader@example.com" });
        await expectAccessible(page);
      });

      test("connected", async ({ page }) => {
        await openOptions(page, { email: "reader@example.com" });
        await save(page);
        await expect(page.getByText("Connected as")).toBeVisible();
        await expectAccessible(page);
      });

      test("token refused", async ({ page }) => {
        await openOptions(page, { status: 401 });
        await save(page);
        await expect(page.getByText("the token wasn't accepted")).toBeVisible();
        await expectAccessible(page);
      });
    });
  }
});

test.describe("extension import dialog", () => {
  const openDialog = async (page: Page, message: Record<string, unknown>) => {
    await page.route(AMAZON_PAGE, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="en"><head><title>Your content</title></head><body><main><h1>Digital content</h1></main></body></html>',
      }),
    );
    await page.addInitScript(() => {
      Object.assign(globalThis, {
        chrome: {
          runtime: {
            sendMessage: async () => undefined,
            onMessage: { addListener: (listener: unknown) => Object.assign(globalThis, { inkwellListener: listener }) },
          },
        },
      });
    });
    await page.goto(AMAZON_PAGE);
    await page.addScriptTag({ path: `${EXTENSION}app.js` });
    await page.evaluate((start) => (globalThis as unknown as { inkwellListener: (message: unknown) => void }).inkwellListener(start), {
      type: "start-import",
      ...message,
    });
    await expect(page.locator("#inkwell-import-status")).toBeVisible();
  };

  test("asks which tab and how many pages", async ({ page }) => {
    await openDialog(page, { account: { email: "reader@example.com", site: "inkwell.example" } });
    await expect(page.getByLabel(/^Pages to import/)).toBeFocused();
    await expectAccessible(page, "#inkwell-import-status");
  });

  test("the keyboard reaches every control, and Cancel closes it", async ({ page }) => {
    await openDialog(page, { account: { email: "reader@example.com", site: "inkwell.example" } });
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("radio", { name: "Books" })).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Import" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#inkwell-import-status")).toHaveCount(0);
  });

  test("shows a failed account check", async ({ page }) => {
    await openDialog(page, { error: "Inkwell didn't accept the API token. Check it in the extension's options." });
    await expect(page.getByRole("alert")).toContainText("Import failed");
    await expectAccessible(page, "#inkwell-import-status");
  });
});
