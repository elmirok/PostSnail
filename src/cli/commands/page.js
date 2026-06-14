import { readFile } from "node:fs/promises";

import { getOfficialPluginManifest, POSTSNAIL_PAGES_PLUGIN_ID } from "../../core/plugins/officialCatalog.js";
import { enablePlugin, installPlugin } from "../../core/plugins/pluginRegistry.js";
import { createPagesItem, normalizeNavigation, normalizePagesState } from "../../pages/plugin.js";
import { parseFrontmatterMarkdown } from "../markdownImport.js";
import { cleanText, openCliWorkspace, readJsonFile, removeBySlug, updateBySlug } from "../state.js";

export async function runPageCommand(positionals, flags) {
  const subcommand = positionals[0];
  if (!["list", "import", "status", "delete", "navigation"].includes(subcommand)) {
    throw new Error("Unknown page command.");
  }
  const context = await openCliWorkspace(flags);
  ensurePagesPlugin(context.state);
  const pages = normalizePagesState(context.state.plugins.state[POSTSNAIL_PAGES_PLUGIN_ID]);

  if (subcommand === "list") {
    for (const page of pages.pages) process.stdout.write(`page\t${page.status}\t${page.path}\t${page.title}\n`);
    for (const doc of pages.docs) process.stdout.write(`doc\t${doc.status}\t${doc.slug}\t${doc.title}\n`);
    if (!pages.pages.length && !pages.docs.length) process.stdout.write("No pages or docs.\n");
    return;
  }

  if (subcommand === "import") {
    const markdownPath = cleanText(positionals[1]);
    if (!markdownPath) throw new Error("Page Markdown path is required.");
    const parsed = parseFrontmatterMarkdown(await readFile(markdownPath, "utf8"));
    const type = cleanText(parsed.meta.type || flags.type || "page") === "doc" ? "doc" : "page";
    const item = createPagesItem(type, {
      ...parsed.meta,
      body: parsed.body,
      status: parsed.meta.status || flags.status || "draft",
    });
    if (type === "doc") {
      pages.docs = [item, ...pages.docs.filter((entry) => entry.slug !== item.slug)];
    } else {
      pages.pages = [item, ...pages.pages.filter((entry) => entry.slug !== item.slug)];
    }
    context.state.plugins.state[POSTSNAIL_PAGES_PLUGIN_ID] = pages;
    await context.save();
    process.stdout.write(`Imported ${type}: ${item.slug}\n`);
    return;
  }

  if (subcommand === "status") {
    const collection = cleanText(flags.collection || "pages") === "docs" ? "docs" : "pages";
    const status = cleanText(flags.status || "draft");
    pages[collection] = updateBySlug(pages[collection], flags.slug, (item) => ({
      ...item,
      status,
      updatedAt: new Date().toISOString(),
      publishedAt: status === "published" ? (item.publishedAt || new Date().toISOString()) : item.publishedAt,
    }));
    context.state.plugins.state[POSTSNAIL_PAGES_PLUGIN_ID] = pages;
    await context.save();
    process.stdout.write(`Updated ${collection} item: ${flags.slug} -> ${status}\n`);
    return;
  }

  if (subcommand === "delete") {
    const collection = cleanText(flags.collection || "pages") === "docs" ? "docs" : "pages";
    pages[collection] = removeBySlug(pages[collection], flags.slug);
    context.state.plugins.state[POSTSNAIL_PAGES_PLUGIN_ID] = pages;
    await context.save();
    process.stdout.write(`Deleted ${collection} item: ${flags.slug}\n`);
    return;
  }

  const navPath = cleanText(flags.file || positionals[1]);
  if (!navPath) throw new Error("Navigation JSON file is required.");
  pages.navigation = normalizeNavigation(await readJsonFile(navPath));
  context.state.plugins.state[POSTSNAIL_PAGES_PLUGIN_ID] = pages;
  await context.save();
  process.stdout.write(`Navigation entries: ${pages.navigation.length}\n`);
}

function ensurePagesPlugin(state) {
  state.plugins ||= { installed: [], lock: {}, state: {} };
  state.plugins = enablePlugin(
    installPlugin(state.plugins, getOfficialPluginManifest(POSTSNAIL_PAGES_PLUGIN_ID)),
    POSTSNAIL_PAGES_PLUGIN_ID,
  );
  state.plugins.state ||= {};
  state.plugins.state[POSTSNAIL_PAGES_PLUGIN_ID] = normalizePagesState(state.plugins.state[POSTSNAIL_PAGES_PLUGIN_ID]);
}
