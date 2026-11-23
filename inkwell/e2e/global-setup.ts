import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import pg from "pg";
import { APP_ENV, assertTestEnv, BASE_URL, DATABASE_URL, EMULATOR_HOST, PROJECT_ID, TEST_USER } from "./env";

export const AUTH_STATE = "e2e/.auth/user.json";

const emulator = (path: string, init?: RequestInit) =>
  fetch(`http://${EMULATOR_HOST}${path}`, { ...init, headers: { "content-type": "application/json", authorization: "Bearer owner" } });

// A fresh emulator account each run, so its uid and password are always known.
async function createTestUser() {
  await emulator(`/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
  const response = await emulator(`/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${APP_ENV.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
    method: "POST",
    body: JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password, displayName: TEST_USER.name }),
  });
  if (!response.ok) throw new Error(`The Auth emulator refused the test user: ${await response.text()}`);
  return ((await response.json()) as { localId: string }).localId;
}

// Through the real login page, which also creates the User row.
async function signIn() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel("Email").fill(TEST_USER.email);
  await page.getByLabel("Password").fill(TEST_USER.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`${BASE_URL}/`);
  mkdirSync("e2e/.auth", { recursive: true });
  await page.context().storageState({ path: AUTH_STATE });
  await browser.close();
}

const BOOKS: { title: string; authors: string[]; status: string; formats: string[]; tags: string[] }[] = [
  { title: "The Quiet Orchard", authors: ["Mara Lind"], status: "TO_READ", formats: ["EBOOK"], tags: ["slow burn", "found family"] },
  { title: "Salt and Lanterns", authors: ["Ines Okafor", "Tom Vale"], status: "TO_READ", formats: ["PHYSICAL", "AUDIO"], tags: [] },
  { title: "A Map of Small Hours", authors: ["June Park"], status: "WISHLIST", formats: [], tags: ["epistolary"] },
  { title: "Glass Harbour", authors: ["Petra Novak"], status: "READING", formats: ["EBOOK"], tags: [] },
  { title: "The Ninth Bell", authors: ["Arun Mehta"], status: "FINISHED", formats: ["PHYSICAL"], tags: ["heist"] },
  { title: "Winter Ledger", authors: ["Cleo Hart"], status: "DNF", formats: ["EBOOK"], tags: [] },
];

// The test user's library, replaced on every run. Shared catalog rows are keyed by id, so reruns reuse them.
async function seedLibrary(userId: string) {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const genre = await client.query<{ genreId: string; tropeId: string }>(
      'SELECT "genreId", "tropeId" FROM "GenreTrope" ORDER BY "genreId", "tropeId" LIMIT 1',
    );
    const topic = genre.rows[0];
    await client.query('DELETE FROM "UserBook" WHERE "userId" = $1', [userId]);
    for (const [index, book] of BOOKS.entries()) {
      const bookId = `e2e-book-${index + 1}`;
      await client.query(
        `INSERT INTO "Book" ("id", "title", "authors", "dedupeKey", "tags", "pageCount", "metadataSource", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, 'MANUAL', now()) ON CONFLICT ("id") DO NOTHING`,
        [bookId, book.title, book.authors, `e2e ${book.title.toLowerCase()}`, book.tags, 200 + index * 50],
      );
      if (topic) {
        await client.query(
          `INSERT INTO "BookGenre" ("bookId", "genreId", "source") VALUES ($1, $2, 'AI') ON CONFLICT DO NOTHING`,
          [bookId, topic.genreId],
        );
        await client.query(
          `INSERT INTO "BookTrope" ("bookId", "tropeId", "source") VALUES ($1, $2, 'AI') ON CONFLICT DO NOTHING`,
          [bookId, topic.tropeId],
        );
      }
      const userBook = await client.query<{ id: string }>(
        `INSERT INTO "UserBook" ("id", "userId", "bookId", "formats", "status", "source", "addedAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3::"BookFormat"[], $4::"ReadingStatus", 'MANUAL', now() - $5 * interval '1 day', now())
         RETURNING "id"`,
        [userId, bookId, book.formats, book.status, index],
      );
      if (book.status !== "TO_READ" && book.status !== "WISHLIST") {
        const outcome = book.status === "READING" ? null : book.status;
        await client.query(
          `INSERT INTO "ReadThrough" ("id", "userBookId", "startedAt", "endedAt", "outcome", "updatedAt")
           VALUES (gen_random_uuid()::text, $1, now() - interval '20 days', $2, $3::"ReadOutcome", now())`,
          [userBook.rows[0].id, outcome ? new Date() : null, outcome],
        );
      }
    }
  } finally {
    await client.end();
  }
}

// Each run's emulator account has a new uid, so last run's User row (same email)
// would block signing in. Its library, tokens and limits go with it.
async function removeLastTestUser() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query('DELETE FROM "User" WHERE "email" = $1', [TEST_USER.email]);
  } finally {
    await client.end();
  }
}

export default async function globalSetup() {
  assertTestEnv();
  const env = { ...process.env, ...APP_ENV };
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env, stdio: "inherit" });
  execFileSync("npx", ["prisma", "db", "seed"], { env, stdio: "inherit" });
  await removeLastTestUser();
  const userId = await createTestUser();
  await signIn();
  await seedLibrary(userId);
}
