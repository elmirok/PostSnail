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

The CLI includes optional local publish and tracker workflows:

- `postsnail publish surge` builds the public files, runs safety checks, hands off to the local Surge bridge, verifies live proof files, and can notify Forest after verification.
- `postsnail forest announce` sends a signed public announce for an already-live site.
- `postsnail shellname register|update|renew` signs public ShellName records locally.
- `postsnail domain move|mirror` signs public site-move records after checking the new live proof.

These commands remain optional and preserve the current trust boundaries. They do not turn PostSnail into a hosted account system and they do not upload raw private keys, Shell passphrases, drafts, rejected comments, or private plugin state.
