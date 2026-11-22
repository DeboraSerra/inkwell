import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Every route handler and server action is a public endpoint, so each one has
// to check who's calling. This reads the source rather than running it, so a
// new endpoint without a check fails here before it ships.

const SRC = join(process.cwd(), "src");
const GUARDS = new Set(["requireUser", "getRequestUser", "isCronRequest"]);
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

// Public on purpose, each with its reason.
const PUBLIC_ENDPOINTS: Record<string, string> = {
  "server/auth/auth.controller.ts#signIn":
    "Signing in is how a visitor gets a session; Firebase verifies the ID token in createSession.",
  "server/auth/auth.controller.ts#signOut": "Only clears the caller's own cookie.",
};

type Endpoint = { file: string; name: string; guarded: boolean };

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((path) => /\.tsx?$/.test(path))
    .filter((path) => !path.startsWith("generated/") && !path.includes("tests/"))
    .map((path) => join(dir, path));

const callsGuard = (node: ts.Node): boolean => {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && GUARDS.has(node.expression.text)) {
    return true;
  }
  return ts.forEachChild(node, callsGuard) ?? false;
};

const isExported = (node: ts.Node) =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);

const hasUseServer = (source: ts.SourceFile) => {
  const first = source.statements[0];
  return (
    first !== undefined &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === "use server"
  );
};

// The exported functions of a file, and whether each body calls a guard.
// `isEndpoint` picks which exports count: every one in a "use server" file,
// only the HTTP methods in a route.
const findEndpoints = (
  file: string,
  text: string,
  isEndpoint: (name: string) => boolean,
): Endpoint[] => {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const endpoints: Endpoint[] = [];
  for (const statement of source.statements) {
    if (!isExported(statement)) continue;
    if (ts.isFunctionDeclaration(statement) && statement.name && isEndpoint(statement.name.text)) {
      endpoints.push({ file, name: statement.name.text, guarded: callsGuard(statement) });
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer && isEndpoint(declaration.name.text)) {
          endpoints.push({ file, name: declaration.name.text, guarded: callsGuard(declaration.initializer) });
        }
      }
    }
  }
  return endpoints;
};

const isUseServerFile = (file: string, text: string) =>
  hasUseServer(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true));

const allEndpoints = () =>
  sourceFiles(SRC).flatMap((path) => {
    const file = relative(SRC, path);
    const text = readFileSync(path, "utf8");
    if (/^app\/.*\/route\.ts$/.test(file)) return findEndpoints(file, text, (name) => HTTP_METHODS.has(name));
    if (isUseServerFile(file, text)) return findEndpoints(file, text, () => true);
    return [];
  });

describe("every endpoint authenticates", () => {
  const endpoints = allEndpoints();

  it("finds the routes and server actions", () => {
    const files = new Set(endpoints.map(({ file }) => file));
    expect(files).toContain("app/api/me/route.ts");
    expect(files).toContain("app/api/cron/enrichment/route.ts");
    expect(files).toContain("server/library/library.controller.ts");
    expect(files).toContain("server/auth/auth.controller.ts");
  });

  it("calls requireUser, getRequestUser or isCronRequest in each one, except the public ones", () => {
    const open = endpoints
      .filter(({ guarded }) => !guarded)
      .map(({ file, name }) => `${file}#${name}`)
      .filter((key) => !(key in PUBLIC_ENDPOINTS));
    expect(open).toEqual([]);
  });

  it("lists only public endpoints that still exist and still have no check", () => {
    const unguarded = new Set(endpoints.filter(({ guarded }) => !guarded).map(({ file, name }) => `${file}#${name}`));
    expect(Object.keys(PUBLIC_ENDPOINTS).filter((key) => !unguarded.has(key))).toEqual([]);
  });

  it("keeps server actions in controllers", () => {
    const actionFiles = [...new Set(endpoints.map(({ file }) => file))].filter((file) => !file.startsWith("app/"));
    expect(actionFiles.filter((file) => !file.endsWith(".controller.ts"))).toEqual([]);
  });
});

describe("findEndpoints", () => {
  const all = () => true;

  it("flags an exported function with no guard", () => {
    const text = `"use server";\nexport async function leak() { return db.all(); }`;
    expect(findEndpoints("x.controller.ts", text, all)).toEqual([
      { file: "x.controller.ts", name: "leak", guarded: false },
    ]);
  });

  it("accepts a guard anywhere in the body, and in an exported arrow function", () => {
    const text = [
      `export async function a() { const user = await requireUser(); return user; }`,
      `export const b = async (request: Request) => { if (!isCronRequest(request)) return null; return 1; };`,
    ].join("\n");
    expect(findEndpoints("x.controller.ts", text, all).map(({ guarded }) => guarded)).toEqual([true, true]);
  });

  it("doesn't count a guard that's only mentioned, not called", () => {
    const text = `export async function c() { const guard = requireUser; return guard; }`;
    expect(findEndpoints("x.controller.ts", text, all)[0]?.guarded).toBe(false);
  });

  it("only counts the exports the filter picks, and never unexported ones", () => {
    const text = [
      `export const maxDuration = 300;`,
      `async function helper() { return 1; }`,
      `export async function GET() { return helper(); }`,
    ].join("\n");
    expect(findEndpoints("app/api/x/route.ts", text, (name) => HTTP_METHODS.has(name))).toEqual([
      { file: "app/api/x/route.ts", name: "GET", guarded: false },
    ]);
  });
});
