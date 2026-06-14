import { getOfficialPluginCatalog, getOfficialPluginManifest } from "../../core/plugins/officialCatalog.js";
import { createPluginRegistry, disablePlugin, enablePlugin, installPlugin } from "../../core/plugins/pluginRegistry.js";
import { openCliWorkspace } from "../state.js";

export async function runPluginCommand(positionals, flags) {
  const subcommand = positionals[0];
  if (!["list", "enable", "disable"].includes(subcommand)) throw new Error("Unknown plugin command.");
  const context = await openCliWorkspace(flags);

  if (subcommand === "list") {
    const registry = createPluginRegistry(getOfficialPluginCatalog(), context.state.plugins);
    const installed = new Map(registry.listInstalled().map((entry) => [entry.id, entry]));
    for (const manifest of getOfficialPluginCatalog()) {
      const entry = installed.get(manifest.id);
      process.stdout.write(`${manifest.id}\t${entry?.enabled ? "enabled" : entry ? "installed" : "available"}\t${manifest.name}\n`);
    }
    return;
  }

  const pluginId = String(positionals[1] || flags.plugin || "").trim();
  if (!pluginId) throw new Error("Plugin id is required.");
  if (subcommand === "enable") {
    const installed = installPlugin(context.state.plugins, getOfficialPluginManifest(pluginId));
    context.state.plugins = enablePlugin(installed, pluginId);
    await context.save();
    process.stdout.write(`Enabled plugin: ${pluginId}\n`);
    return;
  }
  context.state.plugins = disablePlugin(context.state.plugins, pluginId);
  await context.save();
  process.stdout.write(`Disabled plugin: ${pluginId}\n`);
}
