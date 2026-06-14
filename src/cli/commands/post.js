import { readFile } from "node:fs/promises";

import { buildImportedPost, parseFrontmatterMarkdown } from "../markdownImport.js";
import { readWorkspacePassphrase } from "../passphrase.js";
import { cleanText, openCliWorkspace, removeBySlug, splitList, updateBySlug } from "../state.js";
import { openWorkspaceFile, saveWorkspaceFile } from "../workspace-node.js";
import { normalizePost, slugify } from "../../content.js";

export async function runPostCommand(positionals, flags) {
  if (!["list", "new", "import", "status", "delete"].includes(positionals[0])) {
    throw new Error("Unknown post command.");
  }

  if (positionals[0] === "list") {
    const context = await openCliWorkspace(flags);
    const posts = context.state.posts || [];
    if (!posts.length) {
      process.stdout.write("No posts.\n");
      return;
    }
    for (const post of posts) {
      process.stdout.write(`${post.status || "draft"}\t${post.slug}\t${post.title || "Untitled"}\n`);
    }
    return;
  }

  if (positionals[0] === "new") {
    const context = await openCliWorkspace(flags);
    const title = cleanText(flags.title || "Untitled post");
    const slug = cleanText(flags.slug || slugify(title));
    const existingPost = (context.state.posts || []).find((entry) => entry.slug === slug) || null;
    const post = normalizePost({
      ...existingPost,
      id: existingPost?.id || `post-${Date.now().toString(36)}`,
      title,
      slug,
      body: cleanText(flags.body),
      excerpt: cleanText(flags.excerpt),
      tags: splitList(flags.tags),
      status: cleanText(flags.status || "draft"),
      updatedAt: new Date().toISOString(),
      createdAt: existingPost?.createdAt || new Date().toISOString(),
      publishedAt: flags.status === "published" ? (existingPost?.publishedAt || new Date().toISOString()) : existingPost?.publishedAt,
    });
    context.state.posts = [
      post,
      ...(context.state.posts || []).filter((entry) => entry.slug !== post.slug),
    ];
    await context.save();
    process.stdout.write(`Saved post: ${post.slug}\n`);
    return;
  }

  if (positionals[0] === "status") {
    const context = await openCliWorkspace(flags);
    const status = cleanText(flags.status || "draft");
    context.state.posts = updateBySlug(context.state.posts || [], flags.slug, (post) => ({
      ...post,
      status,
      updatedAt: new Date().toISOString(),
      publishedAt: status === "published" ? (post.publishedAt || new Date().toISOString()) : post.publishedAt,
    }));
    await context.save();
    process.stdout.write(`Updated post status: ${flags.slug} -> ${status}\n`);
    return;
  }

  if (positionals[0] === "delete") {
    const context = await openCliWorkspace(flags);
    context.state.posts = removeBySlug(context.state.posts || [], flags.slug);
    await context.save();
    process.stdout.write(`Deleted post: ${flags.slug}\n`);
    return;
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
