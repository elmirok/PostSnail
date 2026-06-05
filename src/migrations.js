import { createWorkspaceData, WORKSPACE_SCHEMA } from "./workspaceSchema.js";
import { CURRENT_WORKSPACE_VERSION as PROTOCOL_WORKSPACE_VERSION } from "./protocol.js";

export const CURRENT_WORKSPACE_VERSION = PROTOCOL_WORKSPACE_VERSION;

export function migrateWorkspace(workspace, options = {}) {
  if (!workspace || typeof workspace !== "object") {
    throw new Error("This is not a PostSnail workspace.");
  }
  if (!workspace.version || !workspace.schema) {
    return createWorkspaceData(
      {
        ...workspace,
        schema: WORKSPACE_SCHEMA,
        version: CURRENT_WORKSPACE_VERSION,
        migratedFromLegacy: true,
      },
      { now: options.now || workspace.updatedAt || workspace.createdAt },
    );
  }
  if (workspace.schema !== WORKSPACE_SCHEMA) {
    throw new Error("This is not a PostSnail workspace.");
  }
  const version = Number(workspace.version || 0);
  if (version > CURRENT_WORKSPACE_VERSION) {
    throw new Error("This workspace was created by a newer PostSnail version.");
  }
  if (version < 1) {
    throw new Error("Unsupported PostSnail workspace version.");
  }
  let migrated = workspace;
  if (version === 1) {
    migrated = migrateV1ToV1(migrated, options);
  }
  return createWorkspaceData(
    {
      ...migrated,
      version: CURRENT_WORKSPACE_VERSION,
      schema: WORKSPACE_SCHEMA,
    },
    { now: options.now || migrated.updatedAt || migrated.createdAt },
  );
}

function migrateV1ToV1(workspace, options) {
  return createWorkspaceData(workspace, {
    now: options.now || workspace.updatedAt || workspace.createdAt,
  });
}
