// Builds the Chrome Web Store package for a deployed Inkwell:
//
//   node extension/build.mjs https://your-inkwell-domain
//
// Writes extension/dist/package/ (load it unpacked to try the store build) and
// extension/dist/inkwell-kindle-import-<version>.zip (upload this). Only the
// extension's own files go in, never build tooling or icon sources. The source
// folder stays set up for local development.
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const FILES = [
  "app.js",
  "background.js",
  "options.html",
  "options.js",
  "icons/icon-16.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
];

const parseOrigin = (value) => {
  try {
    const url = new URL(value);
    const bare = url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password;
    return url.protocol === "https:" && bare ? url.origin : null;
  } catch {
    return null;
  }
};

const origin = parseOrigin(process.argv[2] ?? "");
if (!origin) {
  console.error("Usage: node extension/build.mjs https://your-inkwell-domain");
  console.error("The address must be https, with no path, like https://inkwell.example.com");
  process.exit(1);
}

const source = new URL("./", import.meta.url);
const dist = new URL("dist/", source);
const target = new URL("package/", dist);

await rm(dist, { recursive: true, force: true });
await mkdir(new URL("icons/", target), { recursive: true });
for (const file of FILES) await cp(new URL(file, source), new URL(file, target));

// The store build reaches only the deployed site: no localhost, and no
// permission to ask for other addresses, so the listing needs no
// broad-host-access justification and the options page asks for nothing.
const manifest = JSON.parse(await readFile(new URL("manifest.json", source), "utf8"));
manifest.host_permissions = [`${origin}/*`];
delete manifest.optional_host_permissions;
await writeFile(new URL("manifest.json", target), `${JSON.stringify(manifest, null, 2)}\n`);

await writeFile(
  new URL("config.js", target),
  `// Written by build.mjs for the store build.\nglobalThis.INKWELL_DEFAULT_APP_URL = ${JSON.stringify(origin)};\n`,
);

const zipName = `inkwell-kindle-import-${manifest.version}.zip`;
execFileSync("zip", ["-r", "-X", "-q", new URL(zipName, dist).pathname, "."], { cwd: target.pathname });

console.log(`Built version ${manifest.version} for ${origin}`);
console.log(`  Try it:  load ${target.pathname} unpacked in chrome://extensions`);
console.log(`  Upload:  ${new URL(zipName, dist).pathname}`);
