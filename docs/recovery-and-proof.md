# Recovery and Proof Notes

## Backups

Use `Export backup` after creating your identity, after adding images, and before clearing browser data. The backup contains posts, profile settings, images, and the encrypted private signing key. It must not contain a raw private key.

## Passphrases

The encrypted signing key is only useful with the passphrase that created it. PostSnail has no account system and no recovery server.

## Verifier Results

The Verify tab checks:

- ZIP shape and required proof files.
- Manifest version and declared algorithms.
- Manifest signature against the public key.
- Each post record digest and signature.
- Each generated file hash listed in the manifest.
- Bundle fingerprint over the manifest’s file and post proof set.

If any check fails, treat the ZIP as changed, corrupted, or not a PostSnail export from that publisher key.

## Image Metadata

PostSnail copies selected images into the exported site as-is. Browser APIs do not reliably remove metadata. Use a trusted image-cleaning tool before importing photos if EXIF/GPS metadata matters.

