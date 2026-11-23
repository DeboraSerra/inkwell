import axe from "axe-core";
import { expect } from "vitest";

// The WCAG 2.2 AA rules (Phase 8). jsdom has no layout, styles or canvas, so
// colour contrast and label-in-name (which measures icon fonts on a canvas) are
// left to the browser checks in 8b, and a component rendered alone isn't inside
// the page's landmarks.
const options: axe.RunOptions = {
  runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
  rules: {
    "color-contrast": { enabled: false },
    "label-content-name-mismatch": { enabled: false },
    region: { enabled: false },
  },
  resultTypes: ["violations"],
};

const describeViolation = (violation: axe.Result) =>
  [`${violation.id}: ${violation.help}`, ...violation.nodes.map((node) => `  ${node.target.join(" ")}  ${node.html}`)].join("\n");

// Checks the whole document by default, since dialogs, popovers and menus open in a portal outside the container.
export const expectAccessible = async (root: Element = document.body) => {
  const { violations } = await axe.run(root, options);
  expect(violations.map(describeViolation).join("\n\n"), "axe found accessibility violations").toBe("");
};
