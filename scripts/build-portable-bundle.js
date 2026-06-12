import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildPortableBundle } from "../src/portable/bundle.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

buildPortableBundle({ sourceRoot: rootDir }).then((result) => {
  console.log(`Portable bundle assembled in ${result.outDir}`);
  console.log(`Portable ZIP written to ${result.zipPath}`);
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error || "Portable bundle build failed."));
  process.exitCode = 1;
});
