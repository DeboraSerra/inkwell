import { expect, type Locator, type Page, test } from "@playwright/test";
import { AUTH_STATE } from "./global-setup";

// The parts of the manual pass a browser can check (Phase 8d): Tab never gets
// stuck and always shows where it is, Escape closes what opened and gives focus
// back, nothing scrolls sideways at 320px, and reduced motion stops animations.
// VoiceOver and browser zoom stay manual (docs/plan/phase-8-accessibility-tests.md).

const PAGES = ["/", "/books/shelves?shelf=tbr", "/books/new", "/settings"];
const PUBLIC_PAGES = ["/login", "/privacy"];
const MAX_TABS = 150;

const openShelf = async (page: Page) => {
  await page.goto("/books/shelves?shelf=tbr");
  await expect(page.getByRole("button", { name: /^Actions for / }).first()).toBeVisible();
};

const waitForPage = async (page: Page, path: string) => {
  if (path.startsWith("/books/shelves")) await expect(page.getByRole("button", { name: /^Actions for / }).first()).toBeVisible();
  else await expect(page.getByRole("heading").first()).toBeVisible();
};

// Tabs through the page from the top until focus leaves it. Each stop must be
// on screen and drawn differently from the unfocused element (an outline or a
// ring); a page that never lets go of focus is a trap.
async function tabThrough(page: Page) {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (let press = 0; press < MAX_TABS; press++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body) return null;
      const name = (element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 40);
      const label = `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""} "${name}"`;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const outline = style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0;
      const ring = style.boxShadow !== "none";
      return { label, onScreen: box.width > 0 && box.height > 0, indicated: outline || ring };
    });
    if (!stop) return problems;
    if (seen.has(stop.label)) continue;
    seen.add(stop.label);
    if (!stop.onScreen) problems.push(`${stop.label}: focused but not on screen`);
    if (!stop.indicated) problems.push(`${stop.label}: no visible focus indicator`);
  }
  problems.push(`focus never left the page after ${MAX_TABS} Tabs (a keyboard trap?)`);
  return problems;
}

async function expectEscapeCloses(page: Page, trigger: Locator, popup: Locator) {
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(popup).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(popup).toBeHidden();
  await expect(trigger).toBeFocused();
}

async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() =>
    [document.documentElement, ...document.querySelectorAll("main")]
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => `${element.tagName.toLowerCase()}: ${element.scrollWidth}px wide in ${element.clientWidth}px`),
  );
  expect(overflow, "content wider than the screen").toEqual([]);
}

test.describe("keyboard, signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const path of PUBLIC_PAGES) {
    test(`Tab through ${path}`, async ({ page }) => {
      await page.goto(path);
      await waitForPage(page, path);
      expect(await tabThrough(page)).toEqual([]);
    });
  }
});

test.describe("keyboard, signed in", () => {
  test.use({ storageState: AUTH_STATE });

  for (const path of PAGES) {
    test(`Tab through ${path}`, async ({ page }) => {
      await page.goto(path);
      await waitForPage(page, path);
      expect(await tabThrough(page)).toEqual([]);
    });
  }

  test("Escape closes the shelf's popups and gives focus back", async ({ page }) => {
    await openShelf(page);
    await expectEscapeCloses(page, page.getByRole("button", { name: /^Filter books/ }), page.getByRole("dialog", { name: "Filter books" }));
    await expectEscapeCloses(page, page.getByRole("button", { name: "Sort books" }), page.getByRole("menu"));
    await expectEscapeCloses(page, page.getByRole("button", { name: /^Actions for / }).first(), page.getByRole("menu"));
    await expectEscapeCloses(page, page.getByRole("combobox", { name: "Books per page" }), page.getByRole("listbox"));
  });

  test("Escape closes the edit dialog and gives focus back to the card's menu", async ({ page }) => {
    await openShelf(page);
    const actions = page.getByRole("button", { name: /^Actions for / }).first();
    await actions.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("menuitem", { name: "Edit" }).press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(actions).toBeFocused();
  });

  test("Escape closes the scan menu on the add page", async ({ page }) => {
    await page.goto("/books/new");
    await expectEscapeCloses(page, page.getByRole("button", { name: "Scan barcode" }), page.getByRole("menu"));
  });

  test("Escape closes the account menu, or the phone's drawer", async ({ page }, testInfo) => {
    await page.goto("/");
    if (testInfo.project.name === "phone") {
      await expectEscapeCloses(page, page.getByRole("button", { name: "More" }), page.getByRole("dialog"));
    } else {
      await expectEscapeCloses(page, page.getByRole("button", { name: /Ada Reader/ }), page.getByRole("menu"));
    }
  });
});

for (const [signedIn, paths] of [[true, PAGES], [false, PUBLIC_PAGES]] as const) {
  test.describe(`reflow at 320px, signed ${signedIn ? "in" : "out"}`, () => {
    test.use({ storageState: signedIn ? AUTH_STATE : { cookies: [], origins: [] }, viewport: { width: 320, height: 640 } });

    for (const path of paths) {
      test(path, async ({ page }) => {
        await page.goto(path);
        await waitForPage(page, path);
        await expectNoSidewaysScroll(page);
      });
    }
  });
}

test.describe("reduced motion", () => {
  test.use({ storageState: AUTH_STATE, reducedMotion: "reduce" });

  test("dialogs and popovers open without animating", async ({ page }) => {
    await openShelf(page);
    const moving = () =>
      page.evaluate(() =>
        document
          .getAnimations()
          .filter((animation) => Number(animation.effect?.getComputedTiming().duration ?? 0) > 1)
          .map((animation) => (animation as CSSAnimation).animationName ?? "transition"),
      );
    await page.getByRole("button", { name: /^Filter books/ }).click();
    expect(await moving()).toEqual([]);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^Actions for / }).first().click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    expect(await moving()).toEqual([]);
  });
});
