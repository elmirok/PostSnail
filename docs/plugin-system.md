# PostSnail Plugin System

Plugins extend PostSnail without becoming part of Core. Alpha 1 only defines manifest and permission foundations.

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

## Current Validator

`validatePluginManifest(manifest)` checks required fields, ids, capabilities, permissions, optional/required features, route-scoped runtime declarations, export hooks, state versioning, and size/time budgets.
