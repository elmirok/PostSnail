import { EditorState, RangeSetBuilder } from "@codemirror/state";
import { EditorView, Decoration, ViewPlugin, keymap, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { tags } from "@lezer/highlight";

const postSnailHighlight = HighlightStyle.define([
  { tag: tags.heading1, class: "ps-md-heading-token ps-md-heading1-token" },
  { tag: tags.heading2, class: "ps-md-heading-token ps-md-heading2-token" },
  { tag: tags.heading3, class: "ps-md-heading-token ps-md-heading3-token" },
  { tag: tags.heading, class: "ps-md-heading-token" },
  { tag: tags.strong, class: "ps-md-strong-token" },
  { tag: tags.emphasis, class: "ps-md-emphasis-token" },
  { tag: tags.link, class: "ps-md-link-token" },
  { tag: tags.url, class: "ps-md-link-token" },
  { tag: tags.monospace, class: "ps-md-code-token" },
  { tag: tags.quote, class: "ps-md-quote-token" },
  { tag: tags.list, class: "ps-md-list-token" },
  { tag: tags.contentSeparator, class: "ps-md-rule-token" },
]);

const lineStylePlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildLineDecorations(view);
    }

    update(update) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildLineDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);

export function createPostSnailMarkdownEditor({ parent, value = "", onChange = () => {} }) {
  if (!parent) throw new Error("Markdown editor mount is missing.");
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: value,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        placeholder("Write with Markdown. Use the toolbar when you want symbols inserted for you."),
        syntaxHighlighting(postSnailHighlight),
        lineStylePlugin,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(update.state.doc.toString());
        }),
        EditorView.theme({
          "&": {
            height: "100%",
          },
          ".cm-content": {
            minHeight: "min(48dvh, 540px)",
            padding: "14px",
            caretColor: "var(--ink)",
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            fontSize: "0.98rem",
            fontWeight: "500",
            lineHeight: "1.58",
            textTransform: "none",
          },
          ".cm-scroller": {
            minHeight: "min(48dvh, 540px)",
            overflow: "auto",
          },
          ".cm-focused": {
            outline: "none",
          },
          ".cm-line": {
            padding: "0 2px",
          },
          ".cm-selectionBackground": {
            background: "rgba(239, 64, 86, 0.2) !important",
          },
          ".cm-cursor": {
            borderLeftColor: "var(--ink)",
          },
        }),
      ],
    }),
  });

  return {
    view,
    destroy() {
      view.destroy();
    },
    focus() {
      view.focus();
    },
    getMarkdown() {
      return view.state.doc.toString();
    },
    setMarkdown(markdown) {
      const current = view.state.doc.toString();
      if (current === markdown) return;
      view.dispatch({ changes: { from: 0, to: current.length, insert: markdown || "" } });
    },
    getSelectionRange() {
      const selection = view.state.selection.main;
      return { from: selection.from, to: selection.to };
    },
    insertSnippet(snippet) {
      const selection = view.state.selection.main;
      insertSnippetAtSelection(view, selection, snippet);
    },
    insertSnippetAt(snippet, range) {
      const docLength = view.state.doc.length;
      const from = clampNumber(range?.from, 0, docLength);
      const to = clampNumber(range?.to, from, docLength);
      insertSnippetAtSelection(view, { from, to }, snippet);
    },
  };
}

function insertSnippetAtSelection(view, selection, snippet) {
  const selected = view.state.sliceDoc(selection.from, selection.to);
  const prepared = typeof snippet === "function"
    ? snippet(selected)
    : typeof snippet === "object" && snippet
      ? snippet
      : { text: String(snippet || "") };
  const text = prepared.text || "";
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: text },
    selection: {
      anchor: selection.from + (prepared.cursorOffset ?? text.length),
      head: selection.from + (prepared.cursorOffset ?? text.length) + (prepared.selectionLength ?? 0),
    },
    scrollIntoView: true,
  });
  view.focus();
}

function clampNumber(value, min, max) {
  const number = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, number));
}

function buildLineDecorations(view) {
  const builder = new RangeSetBuilder();
  let inFence = false;
  for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    const classes = lineClasses(line.text, inFence);
    if (/^\s*```/u.test(line.text)) inFence = !inFence;
    if (classes.length) builder.add(line.from, line.from, Decoration.line({ class: classes.join(" ") }));
  }
  return builder.finish();
}

function lineClasses(text, inFence) {
  if (/^\s*```/u.test(text)) return ["ps-md-codeblock-line", "ps-md-code-fence-line"];
  if (inFence) return ["ps-md-codeblock-line"];
  if (/^\s*#\s+/u.test(text)) return ["ps-md-heading-line", "ps-md-heading1-line"];
  if (/^\s*##\s+/u.test(text)) return ["ps-md-heading-line", "ps-md-heading2-line"];
  if (/^\s*###\s+/u.test(text)) return ["ps-md-heading-line", "ps-md-heading3-line"];
  if (/^\s*#{4,6}\s+/u.test(text)) return ["ps-md-heading-line"];
  if (/^\s*>/u.test(text)) return ["ps-md-quote-line"];
  if (/^\s*(?:[-*+]|\d+\.)\s+(?:\[.\]\s+)?/u.test(text)) return ["ps-md-list-line"];
  if (/^\s*\|.+\|\s*$/u.test(text)) return ["ps-md-table-line"];
  if (/^\s*-{3,}\s*$/u.test(text)) return ["ps-md-rule-line"];
  return [];
}
