import { readFileSync } from "node:fs";
import { parse } from "dotenv";

// Everything the browser tests run with comes from .env.test (committed, no
// secrets), with .env.test.local (gitignored) on top for this machine. The build and the
// server get it explicitly, so no real Firebase project, API key or database
// from .env.local is used: next start still reads that file, but only for
// variables not already set.

const readEnvFile = (path: string) => {
  try {
    return parse(readFileSync(path));
  } catch {
    return {};
  }
};

// Each is always passed, empty when .env.test lacks it, so a missing file never
// lets the server fall back to .env.local's value.
const KEYS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "NEXT_DIST_DIR",
  "FIREBASE_AUTH_EMULATOR_HOST",
  "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST",
  "FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_BOOKS_API_KEY",
  "METADATA_USER_AGENT",
  "CRON_SECRET",
] as const;

const testEnv = { ...readEnvFile(".env.test"), ...readEnvFile(".env.test.local") };

export const APP_ENV: Record<string, string> = Object.fromEntries(KEYS.map((key) => [key, testEnv[key] ?? ""]));

export const E2E_PORT = 3100;
export const BASE_URL = `http://localhost:${E2E_PORT}`;
export const EMULATOR_HOST = APP_ENV.FIREBASE_AUTH_EMULATOR_HOST;
export const PROJECT_ID = APP_ENV.FIREBASE_PROJECT_ID;
export const DATABASE_URL = APP_ENV.DATABASE_URL;
// Not in KEYS: only the setup and the tests use it, never the app.
export const TEST_USER = {
  email: testEnv.E2E_USER_EMAIL ?? "",
  password: testEnv.E2E_USER_PASSWORD ?? "",
  name: testEnv.E2E_USER_NAME ?? "",
};

// Called by the global setup rather than on import, so tools that only load the
// config (Knip) never fail on it. Playwright starts the servers first.
export function assertTestEnv() {
  const missing = ["DATABASE_URL", "NEXT_DIST_DIR", "FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_PROJECT_ID", "NEXT_PUBLIC_FIREBASE_API_KEY"].filter(
    (key) => !APP_ENV[key],
  );
  if (!TEST_USER.email) missing.push("E2E_USER_EMAIL");
  if (!TEST_USER.password) missing.push("E2E_USER_PASSWORD");
  if (missing.length) throw new Error(`Set ${missing.join(", ")} in .env.test or .env.test.local for the browser tests.`);
  // The tests replace the test user's library, so they never run on the app's own database.
  if (DATABASE_URL === readEnvFile(".env.local").DATABASE_URL) {
    throw new Error("The browser tests' DATABASE_URL must not be the app's database.");
  }
  if (!PROJECT_ID.startsWith("demo-") || APP_ENV.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== PROJECT_ID) {
    throw new Error('FIREBASE_PROJECT_ID and NEXT_PUBLIC_FIREBASE_PROJECT_ID in .env.test must be the same "demo-" project.');
  }
  if (APP_ENV.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST !== EMULATOR_HOST) {
    throw new Error("NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST in .env.test must match FIREBASE_AUTH_EMULATOR_HOST.");
  }
}
