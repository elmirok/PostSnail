import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { getCliCommandCatalog } from "../src/cli/catalog.js";
import { runCli } from "../src/cli/run.js";

const root = process.cwd();

function exists(path) {
  return existsSync(join(root, path));
}

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

test("portable bundle and TUI entrypoints are removed", () => {
  const pkg = JSON.parse(read("package.json"));

  assert.equal(pkg.bin?.["postsnail-portable"], undefined);
  assert.equal(pkg.scripts?.["portable:build"], undefined);
  assert.equal(pkg.scripts?.["portable:launch"], undefined);
  assert.equal(exists("bin/postsnail-portable.js"), false);
  assert.equal(exists("src/portable"), false);
  assert.equal(exists("portable"), false);
  assert.equal(exists("scripts/build-portable-bundle.js"), false);
  assert.equal(exists("docs/portable-bundle.md"), false);
  assert.equal(exists("docs/portable-bundle/index.html"), false);
});

test("CLI help no longer exposes the guided TUI menu", async () => {
  assert.equal(getCliCommandCatalog().some((entry) => entry.usage === "postsnail menu"), false);

  let output = "";
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk, encoding, callback) => {
    output += String(chunk);
    if (typeof callback === "function") callback();
    return true;
  };
  try {
    await runCli(["--help"]);
  } finally {
    process.stdout.write = originalWrite;
  }

  assert.doesNotMatch(output, /Command Center|postsnail menu|TUI/);
});

test("Reader roadmap placeholder is removed from the public roadmap", () => {
  assert.equal(exists("docs/roadmap/postsnail-reader-plan.md"), false);
  assert.doesNotMatch(read("docs/roadmap/postsnail-master-roadmap-for-codex.md"), /PostSnail Reader|postsnail-reader-plan\.md/);
});
