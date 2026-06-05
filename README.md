# PostSnail

PostSnail is a browser-native admin for publishing a creator-owned static microblog. It stores posts, images, backups, and encrypted publisher keys locally in the browser, then downloads a static ZIP that can be hosted on Cloudflare Pages, GitHub Pages, Netlify, or any plain static host.

The exported site includes:

- `index.html`, archive, tag, post, about, RSS, and JSON feed files.
- `postsnail.manifest.json` with file hashes, post records, post signatures, manifest signature, and bundle fingerprint.
- `.well-known/postsnail.json` with registry-ready public metadata.

PostSnail v1 and Sprint 2 do not call a backend, submit to a registry, upload files, or track usage.

## Run Locally

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`.

## Publish Flow

1. Write at least one published post.
2. Generate or unlock the encrypted ML-DSA-65 publisher key.
3. Open Generate and click `Download signed ZIP`.
4. Open Verify and choose the ZIP to validate it locally.
5. Unzip the bundle and upload its contents to a static host.

## What “Post-Quantum Signed Fingerprint” Means

PostSnail signs canonical post records and the final manifest with ML-DSA-65, a post-quantum signature algorithm standardized by NIST FIPS 204. It hashes canonical records and generated files with SHA3-512. The bundle fingerprint is a `psn1-sha3-512-...` digest over the manifest’s file and post proof set.

This proves that the exported content matches the signed manifest and publisher public key. It does not prove legal identity, truthfulness, or that the JavaScript runtime itself is FIPS-validated.

## Privacy and Recovery

- The private signing key is encrypted with your passphrase before being stored in IndexedDB.
- Losing the passphrase means PostSnail cannot decrypt the signing key.
- Export a backup after creating your identity and after meaningful publishing sessions.
- Image files are copied into the ZIP as selected; strip EXIF/GPS metadata before importing images if that matters for your threat model.

More detail: [Cloudflare Pages guide](docs/cloudflare-pages.md) and [recovery/proof notes](docs/recovery-and-proof.md).

