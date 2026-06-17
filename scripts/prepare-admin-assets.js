import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { generatePublicSite } from "./generate-public-site.js";

const outDir = "dist/postsnail-admin";
const entries = [
  "LICENSE",
  "NOTICE",
  "THIRD_PARTY_NOTICES.md",
  "_headers",
  "admin",
  "app.js",
  "assets",
  "btc-wallet-qr.svg",
  "docs",
  "favicon.png",
  "favicon.svg",
  "features-qa.css",
  "features-qa.html",
  "index.html",
  "manifesto",
  "media-kit",
  "site.css",
  "site.js",
  "src",
  "styles.css",
  "vendor",
  "verify-remote.html",
  "verify-remote.js",
];

generatePublicSite();
rmSync(outDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
mkdirSync(outDir, { recursive: true });

for (const entry of entries) {
  cpSync(entry, join(outDir, entry), { recursive: true, filter: shouldCopyAsset });
}

const oversized = findOversizedFiles(outDir, 25 * 1024 * 1024);
if (oversized.length > 0) {
  throw new Error(`Cloudflare asset limit exceeded:\n${oversized.join("\n")}`);
}

console.log(`Prepared PostSnail admin assets in ${outDir}.`);

function findOversizedFiles(path, maxBytes, found = []) {
  const stats = statSync(path);
  if (stats.isFile()) {
    if (stats.size > maxBytes) found.push(`${path} (${stats.size} bytes)`);
    return found;
  }
  if (!stats.isDirectory()) return found;
  for (const name of readdirSync(path)) {
    findOversizedFiles(join(path, name), maxBytes, found);
  }
  return found;
}

function shouldCopyAsset(source) {
  return !source.split(/[\\/]/u).includes(".DS_Store");
}
