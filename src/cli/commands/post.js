import { readFile } from "node:fs/promises";

import { buildImportedPost, parseFrontmatterMarkdown } from "../markdownImport.js";
import { readWorkspacePassphrase } from "../passphrase.js";
import { openWorkspaceFile, saveWorkspaceFile } from "../workspace-node.js";

export async function runPostCommand(positionals, flags) {
  if (positionals[0] !== "import") {
    throw new Error("Unknown post command.");
  }

  const markdownPath = String(positionals[1] || "");
  const workspacePath = String(flags.workspace || "");
  if (!markdownPath) {
    throw new Error("Markdown draft path is required.");
  }
  if (!workspacePath) {
    throw new Error("Workspace path is required.");
  }

  const markdown = await readFile(markdownPath, "utf8");
  const parsed = parseFrontmatterMarkdown(markdown);
  const imported = await openWorkspaceFile(workspacePath, readWorkspacePassphrase(flags));
  const existingPost = (imported.state.posts || []).find((entry) => entry.slug === parsed.meta.slug) || null;
  const post = buildImportedPost({ meta: parsed.meta, body: parsed.body, existingPost });
  imported.state.posts = [
    post,
    ...(imported.state.posts || []).filter((entry) => entry.slug !== post.slug),
  ];
  await saveWorkspaceFile(workspacePath, imported.state, readWorkspacePassphrase(flags));
  process.stdout.write(`Imported post: ${post.slug}\n`);
}

