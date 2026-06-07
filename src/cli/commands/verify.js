import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import { zipSync } from "../../../vendor/fflate/browser.js";
import { verifyPostSnailZip } from "../../verifier.js";

export async function runVerifyCommand(positionals) {
  const inputPath = String(positionals[0] || "");
  if (!inputPath) {
    throw new Error("Public directory or ZIP path is required.");
  }

  const zipBytes = inputPath.endsWith(".zip")
    ? await readFile(inputPath)
    : zipSync(await readDirectoryAsZipInput(inputPath));
  const result = await verifyPostSnailZip(zipBytes);
  if (!result.ok) {
    throw new Error(`Verification failed: ${result.errors.join("; ")}`);
  }
  process.stdout.write(`Verified ${result.manifest?.bundleFingerprint || ""}\n`);
}

async function readDirectoryAsZipInput(rootPath, currentPath = rootPath, files = {}) {
  const entries = await readdir(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    const nextPath = join(currentPath, entry.name);
    if (entry.isDirectory()) {
      await readDirectoryAsZipInput(rootPath, nextPath, files);
      continue;
    }
    files[relative(rootPath, nextPath)] = await readFile(nextPath);
  }
  return files;
}

