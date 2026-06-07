import { resolveWorkspacePassphrase } from "../passphrase.js";
import { openWorkspaceFile, saveWorkspaceFile } from "../workspace-node.js";

export async function runWorkspaceCommand(positionals, flags) {
  const subcommand = positionals[0];
  if (!["info", "migrate"].includes(subcommand)) {
    throw new Error("Unknown workspace command.");
  }

  const workspacePath = String(flags.workspace || "");
  if (!workspacePath) {
    throw new Error("Workspace path is required.");
  }

  const workspacePassphrase = await resolveWorkspacePassphrase(flags);
  const imported = await openWorkspaceFile(workspacePath, workspacePassphrase);
  if (subcommand === "migrate") {
    const outPath = String(flags.out || workspacePath);
    await saveWorkspaceFile(outPath, imported.state, workspacePassphrase);
    process.stdout.write(`Migrated workspace written to ${outPath}\n`);
    return;
  }
  process.stdout.write([
    `Site: ${imported.state.profile?.siteTitle || "Untitled"}`,
    `Published posts: ${(imported.state.posts || []).filter((post) => post.status === "published").length}`,
    `Assets: ${(imported.state.assets || []).length}`,
    "",
  ].join("\n"));
}
