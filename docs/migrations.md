# PostSnail Workspace Migrations

PostSnail workspace data is versioned so encrypted `.postsnail` files can evolve without abandoning older creators.

Alpha 1 uses:

- `schema: "postsnail-workspace-data"`
- `version: 1`

The migration module exposes:

```js
export const CURRENT_WORKSPACE_VERSION = 1;
export function migrateWorkspace(workspace) {}
```

## Rules

- Migrations are deterministic.
- Future versions migrate one step at a time, such as `v1 -> v2 -> v3`.
- Missing v1 containers are defaulted safely.
- Raw private signing keys are rejected.
- A workspace created by a newer PostSnail version fails with: `This workspace was created by a newer PostSnail version.`

## Legacy JSON

Legacy JSON backups are not the new source format. They remain importable so existing users are not broken, but importing one converts it into the encrypted v1 `.postsnail` workspace format.

## Developer Notes

Future migrations should include tests for the old input shape, the migrated output shape, and any failure mode that protects private data. Migration code should not make network calls or depend on browser storage.
