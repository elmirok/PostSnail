# PostSnail Compatibility Contract

PostSnail must evolve without stranding creators.

The compatibility contract is:

- `.postsnail` is the private editable Shell.
- `.zip` is the public signed Website artifact.
- Old valid Shells should keep opening.
- Old valid public ZIP exports should keep verifying.
- New features should be optional extensions unless older software must fail.
- Unknown optional fields and extensions are ignored safely.
- Unknown required features fail clearly.
- Workspace upgrades use deterministic migrations.
- Public ZIP recovery is not the same as workspace recovery.

## Stable Core

The stable protocol name is `postsnail` with protocol version `1`. The current required core features are:

- `signed-manifest`
- `file-hashes`

These are the baseline for public proof verification. A verifier that cannot support a required feature must fail instead of guessing.

## Optional Extensions

Optional features can appear in `optionalFeatures` and may store data in `extensions`.

Examples include:

- `identity-document`
- `commit-history`
- `sitemap`
- `workspace-vault`
- `tracker-announce`
- `forest-tracker`
- `comments`
- `deployment-assistant`
- `plugins`

Unknown optional fields must not break import, verification, or indexing. Tools may preserve unknown extension data when practical, but they must not interpret it unless they know the feature.

## Required Features

`requiredFeatures` is a safety rail. If a file declares a required feature that the current software does not support, PostSnail fails with a clear unsupported-feature error.

Use required features only when ignoring the feature would make verification unsafe or misleading.

## Legacy Proof Files

Older exports may not declare `protocol`, `version`, `requiredFeatures`, `optionalFeatures`, or `extensions`. They can still verify when their signatures, digests, file hashes, and manifest structure are valid.

Missing newer optional files, such as commit history, sitemap, identity extensions, or tracker metadata, should produce compatibility warnings instead of fatal errors.

## Workspace Migrations

Workspace data is versioned separately from public manifests. Missing workspace versions are treated as legacy backups and converted to the current workspace schema. Older versions migrate step by step. Future versions fail with:

```txt
This workspace was created by a newer PostSnail version.
```

Migration code must be deterministic, preserve plugin state when possible, preserve unknown optional plugin state without interpreting it, and reject raw private signing keys.

## PSEP Requirement

Protocol-risk changes need a PostSnail Enhancement Proposal. See [PSEP process](psep.md) and [PSEP-0001](pseps/PSEP-0001-protocol-compatibility.md).
