import assert from "node:assert/strict";
import test from "node:test";

import { PUBLIC_FONT_OPTIONS, normalizePublicFontChoice, publicFontCssValue } from "../src/publicFonts.js";

test("public website font choices are whitelisted system-safe stacks", () => {
  assert.ok(PUBLIC_FONT_OPTIONS.length >= 5);
  assert.deepEqual(
    PUBLIC_FONT_OPTIONS.map((font) => font.id),
    ["system", "arial", "verdana", "trebuchet", "georgia", "mono"],
  );
  for (const font of PUBLIC_FONT_OPTIONS) {
    assert.equal(typeof font.label, "string");
    assert.equal(typeof font.stack, "string");
    assert.doesNotMatch(font.stack, /url\(|@import|https?:/i);
  }
});

test("unknown public website font ids fall back to the default system stack", () => {
  assert.equal(normalizePublicFontChoice("georgia").id, "georgia");
  assert.equal(normalizePublicFontChoice("not-a-font").id, "system");
  assert.equal(publicFontCssValue("not-a-font"), PUBLIC_FONT_OPTIONS[0].stack);
});
