// Copies the barcode reader's WebAssembly file into public/, so scanning loads
// it from the app instead of a CDN. Run on install and before each build; the
// copy is gitignored. The folder carries the version, so a new release never
// hits an old cached file.
import { copyFile, mkdir, readFile } from "node:fs/promises";

const source = new URL("../node_modules/zxing-wasm/", import.meta.url);
const { version } = JSON.parse(await readFile(new URL("package.json", source), "utf8"));
const target = new URL(`../public/vendor/zxing-wasm/${version}/`, import.meta.url);

await mkdir(target, { recursive: true });
await copyFile(new URL("dist/reader/zxing_reader.wasm", source), new URL("zxing_reader.wasm", target));
console.log(`Copied zxing_reader.wasm ${version} to public/vendor/zxing-wasm/${version}/`);
