import { exportWorkspaceVault, importWorkspaceVault } from "./workspace.js";

export async function encryptLocalShellState(state, passphrase, options = {}) {
  const exported = await exportWorkspaceVault(state, passphrase, options);
  return {
    envelopeText: exported.text,
    envelope: exported.envelope,
    workspace: exported.workspace,
  };
}

export async function decryptLocalShellState(envelopeText, passphrase, options = {}) {
  return importWorkspaceVault(envelopeText, passphrase, options);
}
