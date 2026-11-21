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
