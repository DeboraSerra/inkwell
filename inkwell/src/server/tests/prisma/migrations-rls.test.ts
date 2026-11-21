import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Every table must have row-level security on, or Supabase's Data API exposes
// it to anyone with the anon key. A new table needs an ENABLE ROW LEVEL
// SECURITY in a migration.
const MIGRATIONS = join(process.cwd(), "prisma", "migrations");

const allSql = () =>
  readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readFileSync(join(MIGRATIONS, entry.name, "migration.sql"), "utf8"))
    .join("\n");

const names = (sql: string, pattern: RegExp) =>
  new Set(Array.from(sql.matchAll(pattern), (match) => match[1]));

describe("migrations", () => {
  it("enable row-level security on every table they create", () => {
    const sql = allSql();
    const created = names(sql, /CREATE TABLE "(\w+)"/g);
    const dropped = names(sql, /DROP TABLE (?:IF EXISTS )?"(\w+)"/g);
    const secured = names(sql, /ALTER TABLE "(\w+)" ENABLE ROW LEVEL SECURITY/g);

    const missing = [...created].filter((table) => !dropped.has(table) && !secured.has(table));
    expect(missing).toEqual([]);
    expect(secured.has("_prisma_migrations")).toBe(true);
  });

  it("never turn row-level security off", () => {
    expect(allSql()).not.toMatch(/DISABLE ROW LEVEL SECURITY/);
  });
});
