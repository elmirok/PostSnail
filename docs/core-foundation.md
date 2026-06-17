# PostSnail Core Foundation

PostSnail Core is the small trusted engine that keeps the ecosystem compatible, local-first, and safe to extend.

## What PostSnail Core Owns

- `.postsnail` encrypted Shell format, workspace schema, and deterministic migrations.
- Public Website ZIP export and verification boundaries.
- Canonical content records, signed manifests, file hashes, bundle fingerprints, and proof compatibility.
- Identity/signing-key storage rules, including the rule that raw private keys are never exported.
- Plugin and theme manifest validation foundations.
- Route-level asset declaration helpers.
- Public export safety checks that block private workspace material from the ZIP.

## What Must Stay Out Of Core

- Deployment providers such as SnailLift.
- Forest search, registry policy, ranking, accounts, or moderation queues.
- ShellNames aliases.
- Pages CMS, Comments, Canopy, ShellSeed, or PostMail product behavior.
- Arbitrary plugin execution or marketplace policy.

Core may define the boundaries those projects use, but it should not absorb their product logic.

## Extension Rule

New features should start as optional extensions. Unknown optional fields are ignored safely and preserved where practical. Unknown required features fail clearly before import, verification, or export could become misleading.

## Current Sprint Scope

Alpha 2 Core Foundation adds lightweight APIs under `src/core/` without moving stable modules:

- `validatePluginManifest(manifest)`
- `validatePluginPermissions(permissions)`
- `validateThemeManifest(manifest)`
- `createRouteAssetMap(routes)`
- `validatePublicExportFiles(files)`

The Plugin System Core + Theme System MVP adds:

- plugin registry helpers for install, enable, disable, list, and resolve
- deterministic hook planning without arbitrary code execution
- plugin state migration helpers that preserve missing plugin state
- theme registries, the built-in `quiet-feed` frontend theme, admin theme tokens, and template slots
- optional manifest extension metadata for themes, plugins, and route assets

This is a foundation, not the full plugin runtime or marketplace.
