# Headless Publishing

Headless publishing lets a trusted local human or agent use PostSnail without the browser UI while keeping the same security and compatibility model.

PostSnail still has two exports:

1. Encrypted Shell (`.postsnail`) for the creator.
2. Public Website ZIP (`.zip`) for publishing.

Guidelines:

- Keep the `.postsnail` Shell private.
- Use the Shell passphrase to open the workspace.
- Use the identity passphrase to unlock the signing key for build and zip.
- Verify the public directory or ZIP before deploy steps.
- Do not treat the public ZIP as the full private project source.
- Do not move raw private keys or Shell passphrases into a required backend.

Future CLI slices can add deployment helpers and Forest announce flows, but they must stay optional and preserve the current trust boundaries.

