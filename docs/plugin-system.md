# PostSnail Plugin System

Plugins extend PostSnail without becoming part of Core. Alpha 1 defines validated manifests, permission review, deterministic registries, hook plans, and route-scoped runtime declarations.

The rule is:

```txt
Install does not mean load.
Enable does not mean load everywhere.
Routes decide what assets load.
```

## Manifest Shape

Plugin manifests use:

```json
{
  "protocol": "postsnail-plugin-v1",
  "id": "postsnail-comments",
  "name": "PostSnail Comments",
  "version": "0.1.0",
  "requiredFeatures": [],
  "optionalFeatures": ["route-assets"],
  "extensions": {},
  "capabilities": ["adminPanel", "exportAssets", "runtimeAssets", "storePluginState"],
  "permissions": ["read:posts", "write:pluginState", "export:assets"],
  "runtime": {
    "entry": "runtime/comments.js",
    "css": ["runtime/comments.css"],
    "loadWhen": ["routeType:post"]
  }
}
```

## Safety Rules

- Unknown required plugin features fail clearly.
- Unknown optional features are ignored safely.
- Unknown extension data may be preserved but is not interpreted.
- Plugin permissions must come from the documented allowlist.
- Public runtime assets require route-scoped runtime declarations through `loadWhen`.
- Plugins must not load globally by default.
- Private plugin state stays in the encrypted Shell and must not enter the public ZIP.
- Missing plugin code must not delete encrypted plugin state.

## Current Core APIs

`validatePluginManifest(manifest)` checks required fields, ids, capabilities, permissions, optional/required features, route-scoped runtime declarations, export hooks, state versioning, and size/time budgets.

`createPluginRegistry(manifests, workspacePlugins)` builds a registry from validated manifests plus encrypted Shell plugin state.

`installPlugin`, `enablePlugin`, and `disablePlugin` are pure state helpers. They never run plugin code.

`planPluginHooks(registry, hookName)` returns a deterministic structured plan for declared hooks. It does not execute arbitrary JavaScript.

Third-party plugin loading, plugin ZIP packages, marketplaces, and dynamic imports are future work.
