import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PUBLIC_TEXT_COLOR,
  PUBLIC_FONT_OPTIONS,
  normalizePublicFontChoice,
  normalizePublicTextColor,
  publicFontCssValue,
} from "../src/publicFonts.js";

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

test("public website text color defaults to black and rejects unsafe CSS", () => {
  assert.equal(DEFAULT_PUBLIC_TEXT_COLOR, "#111111");
  assert.equal(normalizePublicTextColor("#223344"), "#223344");
  assert.equal(normalizePublicTextColor("#ABCDEF"), "#abcdef");
  assert.equal(normalizePublicTextColor("red"), DEFAULT_PUBLIC_TEXT_COLOR);
  assert.equal(normalizePublicTextColor("url(https://bad.example)"), DEFAULT_PUBLIC_TEXT_COLOR);
});
