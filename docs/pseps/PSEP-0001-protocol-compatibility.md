# PSEP-0001: Protocol Compatibility

Status: final

Feature name: `protocol-compatibility`

## Motivation

PostSnail must be able to evolve like a real creator-owned protocol. Creators should not lose access to old encrypted Shells, old public ZIP exports, or old manifests just because newer software adds features.

## Files Changed

- `src/protocol.js`
- `src/compatibility.js`
- `src/migrations.js`
- Public manifest generation
- Well-known identity generation
- Commit proof generation
- Workspace vault envelope generation
- Tracker announce payload generation
- Local and remote verification paths
- Forest proof verification
- Compatibility docs and tests

## New Fields

Major protocol records support:

```json
{
  "protocol": "postsnail",
  "version": 1,
  "requiredFeatures": ["signed-manifest", "file-hashes"],
  "optionalFeatures": [],
  "extensions": {}
}
```

## Required Features

Alpha 1 required core features:

- `signed-manifest`
- `file-hashes`

Unknown required features fail clearly.

## Optional Features

Known optional features:

- `identity-document`
- `commit-history`
- `sitemap`
- `workspace-vault`
- `tracker-announce`
- `forest-tracker`
- `comments`
- `cloudflare-deploy`
- `plugins`

Unknown optional features and extensions are ignored safely and preserved when practical.

## Migration Rules

Workspace migrations are deterministic and versioned. Missing workspace versions are legacy JSON backups and migrate to the current workspace schema with `migratedFromLegacy: true`.

Future workspace versions fail with:

```txt
This workspace was created by a newer PostSnail version.
```

Migration code must reject raw private signing keys.

## Verifier Behavior

Verifiers accept current protocol records and legacy `postsnail-v1` records when their signatures, digests, and hashes are valid.

Missing newer optional files, such as commit history or sitemap, create compatibility warnings instead of fatal failures.

Broken signatures, broken hashes, malformed proof files, unsupported future versions, or unknown required features remain fatal.

## Backward Compatibility Impact

Old valid exports continue to verify. Old valid backups continue to import. New exports include compatibility declarations, but the meaning of old fields does not change.

## Security Impact

The compatibility system prevents silent downgrade confusion by separating optional features from required safety features. It also preserves strict failure for corrupted proof data and raw private key leakage.

## Tests Required

- Current manifest verifies.
- Legacy manifest verifies with warning.
- Unknown optional field is ignored.
- Unknown optional extension is ignored.
- Unknown required feature fails clearly.
- Current workspace imports.
- Legacy JSON backup imports.
- Older workspace migrates to current.
- Future workspace version fails safely.
- Raw private key in backup is rejected.
- Plugin state survives migration.
- Missing commit history warns instead of failing.
- Invalid old hash still fails.
- New exports still verify.
