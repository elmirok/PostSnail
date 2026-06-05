# PostSnail Enhancement Proposals

PSEP means PostSnail Enhancement Proposal.

Use a PSEP for any change that can affect compatibility, verification, migration, indexing, or the meaning of protocol fields.

## When A PSEP Is Required

Create a PSEP before changes that:

- Add or remove a protocol file.
- Add a new required feature.
- Change verifier behavior.
- Change workspace schema versions.
- Add a migration.
- Add tracker payload fields with security meaning.
- Change public manifest, identity, commit, announce, or plugin manifest semantics.

Small UI copy, styling, docs, and optional private implementation details usually do not need a PSEP.

## Required Sections

Each PSEP must include:

- Title.
- Status: `draft`, `accepted`, `final`, or `rejected`.
- Feature name.
- Motivation.
- Files changed.
- New fields.
- Required vs optional features.
- Migration rules.
- Verifier behavior.
- Backward compatibility impact.
- Security impact.
- Tests required.

## Compatibility Defaults

The default answer should be optional extension. A feature becomes required only when ignoring it would make old software accept something unsafe or misleading.

Unknown optional fields are ignored. Unknown required features fail clearly. Old valid workspaces migrate. Old valid public exports verify with warnings when newer optional files are missing.

See [PSEP-0001](pseps/PSEP-0001-protocol-compatibility.md) for the baseline compatibility policy.
