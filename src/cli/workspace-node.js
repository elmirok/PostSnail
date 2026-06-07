import { readFile, writeFile } from "node:fs/promises";

import { decryptSecretKey } from "../crypto.js";
import { exportWorkspaceVault, importWorkspaceVault } from "../workspace.js";

export async function openWorkspaceFile(workspacePath, passphrase) {
  const text = await readFile(workspacePath, "utf8");
  return importWorkspaceVault(text, passphrase);
}

export async function saveWorkspaceFile(workspacePath, state, passphrase) {
  const exported = await exportWorkspaceVault(state, passphrase);
  await writeFile(workspacePath, exported.text, "utf8");
  return exported;
}

export async function unlockWorkspaceIdentity(state, passphrase) {
  if (!state?.identity?.encryptedSecretKey) {
    throw new Error("This Shell does not contain an encrypted signing key.");
  }
  return decryptSecretKey(state.identity.encryptedSecretKey, passphrase);
}

