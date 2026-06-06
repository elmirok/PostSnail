# PostSnail Plugin Migrations

Plugin state lives inside the encrypted `.postsnail` Shell. It is private by default and must survive workspace export, import, and migration.

## Rules

- Each plugin state object may carry its own `schemaVersion`.
- Missing plugin code must not delete plugin state.
- Unknown plugin fields must be preserved without interpretation.
- Unsupported future plugin state should stay preserved until the matching plugin can migrate it.
- Public Website ZIP exports must never include private plugin state.

## Current MVP

`migratePluginState(plugins, manifests)` normalizes the encrypted Shell plugin container, preserves unknown fields, and returns warnings when a Shell has installed/state entries for plugins that are not currently installed.

The warning text should be clear:

```txt
This workspace uses plugin X, but it is not installed. Its state is preserved.
```

Future official plugins can add deterministic plugin-specific migrations through the hook planner and PSEP process.
