export const PUBLIC_FONT_OPTIONS = [
  {
    id: "system",
    label: "System Sans",
    stack: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  {
    id: "arial",
    label: "Arial / Helvetica",
    stack: "Arial, Helvetica, sans-serif",
  },
  {
    id: "verdana",
    label: "Verdana",
    stack: "Verdana, Geneva, sans-serif",
  },
  {
    id: "trebuchet",
    label: "Trebuchet",
    stack: '"Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Arial, sans-serif',
  },
  {
    id: "georgia",
    label: "Georgia Serif",
    stack: 'Georgia, "Times New Roman", Times, serif',
  },
  {
    id: "mono",
    label: "Courier Mono",
    stack: '"Courier New", Courier, monospace',
  },
];

const DEFAULT_FONT = PUBLIC_FONT_OPTIONS[0];
export const DEFAULT_PUBLIC_TEXT_COLOR = "#111111";

export function normalizePublicFontChoice(value) {
  const id = String(value || DEFAULT_FONT.id).trim().toLowerCase();
  return PUBLIC_FONT_OPTIONS.find((font) => font.id === id) || DEFAULT_FONT;
}

export function publicFontCssValue(value) {
  return normalizePublicFontChoice(value).stack;
}

export function normalizePublicTextColor(value) {
  const color = String(value || DEFAULT_PUBLIC_TEXT_COLOR).trim().toLowerCase();
  return /^#[0-9a-f]{6}$/u.test(color) ? color : DEFAULT_PUBLIC_TEXT_COLOR;
}
