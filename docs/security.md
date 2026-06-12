# PostSnail Security Notes

PostSnail separates private source protection from public accountability.

## Workspace Encryption

Encrypted `.postsnail` Shells use AES-256-GCM through Web Crypto. The encryption key is derived from the Shell passphrase with PBKDF2-SHA-256, a random salt, and a high iteration count. Each vault also uses a random IV and a SHA3-512 workspace fingerprint.

Browser-local editable Shell data is encrypted the same way in IndexedDB. Reopening a local Shell from the same browser requires the Shell passphrase. Old plaintext browser data, when detected, must be migrated with `Migrate Local Data`.

The passphrase matters. PostSnail has no account system, no recovery server, and no backend that can reset it.

SnailLift publishes through Surge in Alpha 1B. The Surge login and token stay inside the encrypted Shell. PostSnail does not write them to the public Website ZIP, browser localStorage, or tracker payloads.

## What Encryption Protects

Workspace encryption protects the editable source file and browser-local Shell cache at rest when the passphrase is strong and the device/browser is not compromised. It keeps drafts, private plugin state, moderation notes, rejected comments, images, settings, and encrypted identity material out of the public Website ZIP.

## What Encryption Does Not Prove

Encryption does not prove legal identity, factual truth, authorship beyond possession of keys, device integrity, or that the JavaScript runtime is FIPS-validated. It also cannot recover a lost passphrase.

## Public Proof

The Website ZIP uses SHA3-512 digests and ML-DSA-65 signatures to prove that public files and post records match the signed manifest and publisher public key. Those proofs are public and meant for readers, verifiers, and Forest-style trackers.

## Metadata And Publishing

Images are copied as selected. Strip EXIF/GPS metadata before importing images if that matters for your threat model.

Do not upload `.postsnail` files to static hosting. Upload only the unzipped public Website ZIP contents.
