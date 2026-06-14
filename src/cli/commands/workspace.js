import { resolveWorkspacePassphrase } from "../passphrase.js";
import { openWorkspaceFile, saveWorkspaceFile } from "../workspace-node.js";
import { exportWorkspaceVault } from "../../workspace.js";

export async function runWorkspaceCommand(positionals, flags) {
  const subcommand = positionals[0];
  if (!["create", "info", "migrate"].includes(subcommand)) {
    throw new Error("Unknown workspace command.");
  }

  const workspacePath = String(flags.workspace || "");
  if (!workspacePath) {
    throw new Error("Workspace path is required.");
  }

  const workspacePassphrase = await resolveWorkspacePassphrase(flags);
  if (subcommand === "create") {
    const exported = await exportWorkspaceVault({
      profile: {
        siteTitle: String(flags["site-title"] || flags.title || "Untitled PostSnail").trim(),
        handle: String(flags.handle || "").trim(),
        siteUrl: String(flags["site-url"] || "").trim(),
        description: String(flags.description || "").trim(),
      },
      posts: [],
      assets: [],
      identity: {},
      settings: {},
      commitHistory: [],
      plugins: { installed: [], lock: {}, state: {} },
      moderation: { approvedComments: [], rejectedComments: [], blockedPublicKeys: [] },
      trackerUrls: [],
      shellNames: [],
      siteMoves: [],
      appearance: { frontendTheme: "quiet-feed", adminTheme: "default", themeSettings: {} },
      exportHistory: [],
    }, workspacePassphrase);
    await import("node:fs/promises").then(({ writeFile }) => writeFile(workspacePath, exported.text, "utf8"));
    process.stdout.write(`Created Shell: ${workspacePath}\n`);
    return;
  }

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
