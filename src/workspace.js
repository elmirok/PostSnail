import { importBackup } from "./backup.js";
import { slugify } from "./content.js";
import { migrateWorkspace } from "./migrations.js";
import { decryptWorkspace, encryptWorkspace, serializeWorkspaceEnvelope } from "./workspaceCrypto.js";
import { createWorkspaceData, RAW_PRIVATE_KEY_ERROR } from "./workspaceSchema.js";

export async function exportWorkspaceVault(state, passphrase, options = {}) {
  const workspace = createWorkspaceData(state, options);
  const envelope = await encryptWorkspace(workspace, passphrase, options);
  return {
    filename: `postsnail-${slugify(workspace.profile.siteTitle || "workspace")}.postsnail`,
    text: serializeWorkspaceEnvelope(envelope),
    envelope,
    workspace,
  };
}

export async function importWorkspaceVault(text, passphrase, options = {}) {
  const decrypted = await decryptWorkspace(text, passphrase);
  const workspace = migrateWorkspace(decrypted, options);
  return {
    migrated: decrypted.version !== workspace.version,
    workspace,
    state: workspaceToAppState(workspace),
  };
}

export function importLegacyBackupJson(text, options = {}) {
  let imported;
  try {
    imported = importBackup(text);
  } catch (error) {
    if (/raw private|private signing keys|Backups must not contain/i.test(error.message)) {
      throw new Error(RAW_PRIVATE_KEY_ERROR);
    }
    throw error;
  }
  const workspace = createWorkspaceData(imported, options);
  return {
    migrated: true,
    workspace,
    state: workspaceToAppState(workspace),
  };
}

export function workspaceToAppState(workspace) {
  const clean = createWorkspaceData(workspace, { now: workspace.updatedAt || workspace.createdAt });
  return {
    profile: clean.profile,
    posts: clean.posts,
    assets: clean.assets,
    identity: Object.keys(clean.identity).length ? clean.identity : null,
    settings: clean.settings,
    commitHistory: clean.commitHistory,
    plugins: clean.plugins,
    moderation: clean.moderation,
    trackerUrls: clean.trackerUrls,
    exportHistory: clean.exportHistory,
  };
}
