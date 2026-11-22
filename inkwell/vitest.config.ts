import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/server/tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    // `npm run test:coverage`. Server code, components and hooks; the generated
    // client, vendored shadcn components, tests and type files aren't counted.
    coverage: {
      provider: "v8",
      include: ["src/server/**", "src/components/**/*.{ts,tsx}", "src/hooks/**"],
      exclude: ["src/generated/**", "src/components/ui/**", "src/server/tests/**", "src/components/tests/**", "**/*.type.ts", "**/*.type.tsx"],
      // The files not fully covered, the totals, and lcov for CI.
      reporter: [["text", { skipFull: true }], "text-summary", "lcov"],
      reportsDirectory: "coverage",
      // 95% on every measure, which the suite passes (asked by the user on 2026-11-22).
      thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
    },
    projects: [
      // Server code and pure client helpers run in Node.
      { extends: true, test: { name: "node", include: ["src/**/*.test.ts"] } },
      // React components and hooks run in a simulated browser.
      {
        extends: true,
        test: {
          name: "dom",
          include: ["src/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["src/components/tests/setup.ts"],
        },
      },
    ],
  },
});
