import { findUnusedAssets, removeUnusedAssets } from "../../assetCleanup.js";
import { openCliWorkspace } from "../state.js";

export async function runAssetCommand(positionals, flags) {
  const subcommand = positionals[0];
  if (!["list", "unused", "delete-unused"].includes(subcommand)) throw new Error("Unknown asset command.");
  const context = await openCliWorkspace(flags);

  if (subcommand === "list") {
    const assets = context.state.assets || [];
    for (const asset of assets) process.stdout.write(`${asset.id}\t${asset.filename || asset.name || "asset"}\n`);
    if (!assets.length) process.stdout.write("No assets.\n");
    return;
  }

  const unused = findUnusedAssets(context.state);
  if (subcommand === "unused") {
    for (const asset of unused) process.stdout.write(`${asset.id}\t${asset.filename || asset.name || "asset"}\n`);
    if (!unused.length) process.stdout.write("No unused assets.\n");
    return;
  }

  const cleaned = removeUnusedAssets(context.state);
  context.state = cleaned.state;
  await context.save(context.state);
  process.stdout.write(`Removed unused assets: ${unused.length}\n`);
}
