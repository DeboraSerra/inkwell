import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { type Program, parseSync, visitorKeys } from "oxc-parser";
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

// A loose view of oxc's ESTree nodes, enough to walk any of them.
type AstNode = { type: string; [key: string]: unknown };

const isNode = (value: unknown): value is AstNode =>
  typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";

const children = (node: AstNode): AstNode[] =>
  (visitorKeys[node.type] ?? []).flatMap((key) => {
    const value = node[key];
    return (Array.isArray(value) ? value : [value]).filter(isNode);
  });

const callsGuard = (node: unknown): boolean => {
  if (!isNode(node)) return false;
  if (node.type === "CallExpression" && isNode(node.callee) && node.callee.type === "Identifier") {
    if (GUARDS.has(node.callee.name as string)) return true;
  }
  return children(node).some(callsGuard);
};

const parse = (file: string, text: string): Program => {
  const { program, errors } = parseSync(file, text);
  if (errors.length > 0) throw new Error(`Couldn't parse ${file}: ${errors[0]?.message}`);
  return program;
};

const hasUseServer = (program: Program) => {
  const first = program.body[0];
  return (
    first?.type === "ExpressionStatement" &&
    first.expression.type === "Literal" &&
    first.expression.value === "use server"
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
  const endpoints: Endpoint[] = [];
  for (const statement of parse(file, text).body) {
    if (statement.type !== "ExportNamedDeclaration") continue;
    const declaration = statement.declaration;
    if (declaration?.type === "FunctionDeclaration" && declaration.id && isEndpoint(declaration.id.name)) {
      endpoints.push({ file, name: declaration.id.name, guarded: callsGuard(declaration) });
    }
    if (declaration?.type === "VariableDeclaration") {
      for (const { id, init } of declaration.declarations) {
        if (id.type === "Identifier" && init && isEndpoint(id.name)) {
          endpoints.push({ file, name: id.name, guarded: callsGuard(init) });
        }
      }
    }
  }
  return endpoints;
};

const isUseServerFile = (file: string, text: string) => hasUseServer(parse(file, text));

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
