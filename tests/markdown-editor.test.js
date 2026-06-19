import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

test("PostSnail Markdown editor is backed by CodeMirror and stores Markdown text", () => {
  const source = read("src/editor/postsnailMarkdownEditor.js");
  const app = read("app.js");

  assert.match(source, /@codemirror\/lang-markdown/);
  assert.match(source, /markdown\(\)/);
  assert.match(source, /history\(\)/);
  assert.match(source, /defaultKeymap/);
  assert.match(source, /historyKeymap/);
  assert.match(source, /update\.state\.doc\.toString\(\)/);
  assert.match(source, /getMarkdown\(\)/);
  assert.match(source, /insertSnippet/);
  assert.match(source, /getSelectionRange\(\)/);
  assert.match(source, /insertSnippetAt/);
  assert.match(source, /insertSnippetAtSelection/);
  assert.match(source, /typeof snippet === "object"/);
  assert.match(source, /textTransform:\s*"none"/);
  assert.match(source, /system-ui, -apple-system/);
  assert.match(app, /syncMarkdownEditorToForm\(\);/);
  assert.match(app, /state\.form\.body = state\.markdownEditor\.getMarkdown\(\)/);
});

test("PostSnail Markdown editor has inline visual token styles for common Markdown", () => {
  const source = read("src/editor/postsnailMarkdownEditor.js");
  const css = read("styles.css");

  for (const expected of [
    "ps-md-heading1-line",
    "ps-md-heading2-line",
    "ps-md-heading3-line",
    "ps-md-quote-line",
    "ps-md-list-line",
    "ps-md-codeblock-line",
    "ps-md-table-line",
    "ps-md-rule-line",
    "ps-md-strong-token",
    "ps-md-emphasis-token",
    "ps-md-link-token",
    "ps-md-code-token",
  ]) {
    assert.match(source, new RegExp(expected));
    assert.match(css, new RegExp(expected));
  }
});

test("admin label styling does not uppercase CodeMirror Markdown token spans", () => {
  const css = read("styles.css");

  assert.match(css, /\.field > span/);
  assert.doesNotMatch(css, /\.field span,/);
  assert.match(css, /\.markdown-editor-mount \.cm-editor\s*\{[\s\S]*text-transform:\s*none;/);
});

test("vendored Markdown editor bundle and license notices are present", () => {
  const bundlePath = "vendor/postsnail-editor/editor.bundle.js";
  const licensePath = "vendor/postsnail-editor/LICENSES.md";
  const thirdParty = read("THIRD_PARTY_NOTICES.md");

  assert.ok(existsSync(join(root, bundlePath)));
  assert.ok(existsSync(join(root, licensePath)));
  assert.match(read(bundlePath), /createPostSnailMarkdownEditor/);
  assert.match(read(licensePath), /@codemirror\/view/);
  assert.match(read(licensePath), /@lezer\/markdown/);
  assert.match(thirdParty, /vendor\/postsnail-editor\/editor\.bundle\.js/);
  assert.match(thirdParty, /vendor\/postsnail-editor\/LICENSES\.md/);
});
