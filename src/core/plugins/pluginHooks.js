export const SUPPORTED_PLUGIN_HOOKS = [
  "admin:registerPanels",
  "admin:registerSettings",
  "workspace:migrate",
  "export:beforeBuild",
  "export:routes",
  "export:assets",
  "export:sitemap",
  "export:feeds",
  "export:manifestExtensions",
  "export:afterBuild",
  "verify:publicOutput",
];

export function planPluginHooks(registry, hookName) {
  const hook = String(hookName || "").trim();
  if (!SUPPORTED_PLUGIN_HOOKS.includes(hook)) {
    throw new Error(`Unsupported plugin hook: ${hook}`);
  }
  const enabled = typeof registry?.listEnabled === "function" ? registry.listEnabled() : [];
  return enabled
    .filter((entry) => Array.isArray(entry.manifest?.export?.hooks) && entry.manifest.export.hooks.includes(hook))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((entry, order) => ({
      pluginId: entry.id,
      hook,
      order,
      capabilities: [...(entry.manifest.capabilities || [])],
      permissions: [...(entry.manifest.permissions || [])],
    }));
}
