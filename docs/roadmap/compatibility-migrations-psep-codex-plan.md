# Compatibility / Migrations / PSEP Status Plan

## Status

Mostly complete in the current repository state.

## Implemented References

- `docs/compatibility.md`
- `docs/protocol.md`
- `docs/psep.md`
- `docs/pseps/PSEP-template.md`
- `docs/pseps/PSEP-0001-protocol-compatibility.md`
- `src/protocol.js`
- `src/compatibility.js`
- `src/migrations.js`

## Rule For Codex

Do not restart this sprint before Core Foundation. Treat the compatibility baseline as active unless a future PSEP changes it.

## Remaining Follow-Up

Future protocol-risk changes must use the PSEP process and add compatibility tests before changing workspace, manifest, tracker, plugin, or verifier behavior.
