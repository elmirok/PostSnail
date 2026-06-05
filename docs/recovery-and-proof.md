# Recovery and Proof Notes

## Workspace Vaults

Use `Export Workspace` after creating your identity, after adding images, and before clearing browser data. The downloaded `.postsnail` file is the private encrypted editable source for the project.

PostSnail has two exports:

1. Encrypted Workspace (`.postsnail`) for the creator.
2. Public Website ZIP (`.zip`) for publishing.

The `.postsnail` workspace contains posts, drafts, profile settings, images, plugin state, moderation data, commit history, and the encrypted private signing key. It must never contain a raw private key and should not be uploaded to public hosting.

## Passphrases

The encrypted signing key is only useful with the passphrase that created it. The encrypted workspace is only useful with the workspace passphrase that created it. PostSnail has no account system and no recovery server.

If both browser data and the `.postsnail` workspace/passphrase are lost, PostSnail cannot restore private keys, drafts, plugin state, rejected comments, or editable source history.

## Public ZIP Recovery

The public Website ZIP is not the full project source. A published ZIP or deployed site can only recover public pages, public assets, feeds, public proof files, and public post records. It cannot restore private signing keys, drafts, private plugin state, rejected comments, moderation notes, or recovery data.

To move to another computer, export `.postsnail`, import it in the new browser, unlock the publisher key, then export a new public Website ZIP.

## Verifier Results

The Verify tab checks:

- ZIP shape and required proof files.
- Manifest version and declared algorithms.
- Manifest signature against the public key.
- Each post record digest and signature.
- Each generated file hash listed in the manifest.
- Signed identity/discovery metadata in `.well-known/postsnail.json`.
- Domain binding when a site URL is declared.
- Signed export commit history when present.
- Bundle fingerprint over the manifest’s file and post proof set.

If any check fails, treat the ZIP as changed, corrupted, or not a PostSnail export from that publisher key.

## Image Metadata

PostSnail copies selected images into the exported site as-is. Browser APIs do not reliably remove metadata. Use a trusted image-cleaning tool before importing photos if EXIF/GPS metadata matters.
