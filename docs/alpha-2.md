# PostSnail Alpha 2

Alpha 2 is the first lean release after the prototype cleanup pass. It keeps the PostSnail promise narrow: creator-owned encrypted Shells, public signed Website ZIPs, optional Forest discovery, and no required hosted admin.

## What Changed

- Portable launcher asks whether to run Admin only, Forest only, or Admin + Forest.
- SnailLift is Surge-only for hosted publishing, with Download Website ZIP still available as the universal fallback.
- Official bundled extensions stay declarative and route-scoped. Installing or enabling a plugin does not load third-party code.
- Public proof metadata uses generator version `0.2.0`.
- The repository removed old experimental Forest, Reader, mock package, and pre-Surge provider prototypes from tracked code.

## What Stayed Stable

- `.postsnail` remains the private encrypted editable Shell.
- `.zip` remains the public static signed website artifact.
- Forest remains a tracker and search surface, not the source of truth.
- Protocol version remains `postsnail` version `1`.
- Old valid Shells and old valid public ZIP exports should keep opening and verifying.

## Alpha 2 Boundaries

Alpha 2 does not add accounts, a plugin marketplace, third-party plugin loading, legal identity, moderation authority, federation, semantic search, or required backend publishing. Those require future PSEPs or roadmap sprints when they touch protocol, workspace, verification, or migration behavior.
