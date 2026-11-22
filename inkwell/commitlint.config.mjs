// Conventional commits. Here rather than at the repo root so `extends`
// resolves from this folder's node_modules; the hook runs from here.
export default {
  extends: ["@commitlint/config-conventional"],
  // Dependabot's bodies hold long release notes and links; its headers follow
  // the prefix set in .github/dependabot.yml.
  ignores: [(message) => message.includes("Signed-off-by: dependabot[bot]")],
  rules: {
    "header-max-length": [2, "always", 100],
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "docs", "style", "refactor", "test", "chore", "build", "ci", "perf", "revert"],
    ],
  },
};
