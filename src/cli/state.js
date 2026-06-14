import { readFile } from "node:fs/promises";

import { resolveWorkspacePassphrase } from "./passphrase.js";
import { openWorkspaceFile, saveWorkspaceFile } from "./workspace-node.js";

export async function requireWorkspacePath(flags = {}) {
  const workspacePath = String(flags.workspace || flags.out || "").trim();
  if (!workspacePath) throw new Error("Workspace path is required.");
  return workspacePath;
}

export async function openCliWorkspace(flags = {}) {
  const workspacePath = await requireWorkspacePath(flags);
  const workspacePassphrase = await resolveWorkspacePassphrase(flags);
  const imported = await openWorkspaceFile(workspacePath, workspacePassphrase);
  return {
    workspacePath,
    workspacePassphrase,
    imported,
    state: imported.state,
    async save(nextState = imported.state) {
      imported.state = nextState;
      await saveWorkspaceFile(workspacePath, nextState, workspacePassphrase);
      return nextState;
    },
  };
}

export function splitList(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  return String(value || "")
    .split(/[\n,]/u)
    .map(cleanText)
    .filter(Boolean);
}

export function cleanText(value) {
  return String(value || "").trim();
}

export function readJsonFile(path) {
  return readFile(path, "utf8").then((text) => JSON.parse(text));
}

export function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function updateBySlug(items = [], slug, updater) {
  const target = cleanText(slug);
  if (!target) throw new Error("Slug is required.");
  let found = false;
  const next = items.map((item) => {
    if (item.slug !== target) return item;
    found = true;
    return updater(item);
  });
  if (!found) throw new Error(`No item found with slug: ${target}`);
  return next;
}

export function removeBySlug(items = [], slug) {
  const target = cleanText(slug);
  if (!target) throw new Error("Slug is required.");
  const next = items.filter((item) => item.slug !== target);
  if (next.length === items.length) throw new Error(`No item found with slug: ${target}`);
  return next;
}
