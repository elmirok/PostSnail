import { buildFromWorkspaceState, writeZipFile } from "../public-site.js";
import { resolveIdentityPassphrase, resolveWorkspacePassphrase } from "../passphrase.js";
import { openWorkspaceFile, saveWorkspaceFile } from "../workspace-node.js";

export async function runZipCommand(flags) {
  const workspacePath = String(flags.workspace || "");
  const outPath = String(flags.out || "");
  if (!workspacePath) throw new Error("Workspace path is required.");
  if (!outPath) throw new Error("Output ZIP path is required.");

  const workspacePassphrase = await resolveWorkspacePassphrase(flags);
  const identityPassphrase = await resolveIdentityPassphrase(flags);
  const imported = await openWorkspaceFile(workspacePath, workspacePassphrase);
  const result = await buildFromWorkspaceState(imported.state, identityPassphrase);
  await writeZipFile(outPath, result.zipBytes);
  imported.state.commitHistory = result.commitHistory;
  await saveWorkspaceFile(workspacePath, imported.state, workspacePassphrase);
  process.stdout.write(`Wrote ${outPath}\nBundle fingerprint: ${result.bundleFingerprint}\n`);
}

