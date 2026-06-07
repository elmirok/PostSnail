import { buildFromWorkspaceState, writePublicFiles } from "../public-site.js";
import { resolveIdentityPassphrase, resolveWorkspacePassphrase } from "../passphrase.js";
import { openWorkspaceFile, saveWorkspaceFile } from "../workspace-node.js";

export async function runBuildCommand(flags) {
  const workspacePath = String(flags.workspace || "");
  const outDir = String(flags.out || "");
  if (!workspacePath) throw new Error("Workspace path is required.");
  if (!outDir) throw new Error("Output directory is required.");

  const workspacePassphrase = await resolveWorkspacePassphrase(flags);
  const identityPassphrase = await resolveIdentityPassphrase(flags);
  const imported = await openWorkspaceFile(workspacePath, workspacePassphrase);
  const result = await buildFromWorkspaceState(imported.state, identityPassphrase);
  await writePublicFiles(outDir, result.files);
  imported.state.commitHistory = result.commitHistory;
  await saveWorkspaceFile(workspacePath, imported.state, workspacePassphrase);
  process.stdout.write(`Built ${outDir}\nBundle fingerprint: ${result.bundleFingerprint}\n`);
}

