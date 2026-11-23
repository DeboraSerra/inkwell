import { defineConfig, devices } from "@playwright/test";
import { APP_ENV, BASE_URL, E2E_PORT, EMULATOR_HOST, PROJECT_ID } from "./e2e/env";

// Accessibility checks in a real browser (Phase 8b): `npm run test:a11y`.
// Playwright starts the Auth emulator and a production build of the app on
// port 3100, built into .next-e2e so the real .next is left alone.
export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/.results",
  globalSetup: "./e2e/global-setup.ts",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: BASE_URL, colorScheme: "dark", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      // The project and host come from .env.test; the port must match e2e/firebase.json.
      command: `npm run e2e:emulator -- --project ${PROJECT_ID || "demo-inkwell"}`,
      url: `http://${EMULATOR_HOST || "127.0.0.1:9099"}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // A clean build each run: a reused .next-e2e once kept an old stylesheet.
      command: `node -e "require('node:fs').rmSync('.next-e2e', { recursive: true, force: true })" && npm run build && npx next start --port ${E2E_PORT}`,
      url: `${BASE_URL}/login`,
      env: { ...process.env, ...APP_ENV } as Record<string, string>,
      // Never reuse a server on this port: it might not be the emulator build.
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
