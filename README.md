# PostSnail

PostSnail is a browser-native admin for publishing a creator-owned static microblog. It stores posts, images, backups, and encrypted publisher keys locally in the browser, then downloads a static ZIP that can be hosted on Cloudflare Pages, GitHub Pages, Netlify, or any plain static host.

The exported site includes:

- `index.html`, archive, tag, post, about, sitemap, RSS, and JSON feed files.
- `postsnail.manifest.json` with file hashes, post records, post signatures, manifest signature, and bundle fingerprint.
- `.well-known/postsnail.json` as a signed identity/discovery document bound to the creator domain when a site URL is set.
- `.well-known/postsnail/latest-commit.json` and `.well-known/postsnail/commits.json` with signed export history.

PostSnail does not require a backend, submit automatically to a registry, upload files, create accounts, or track usage.

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
6. Optionally copy the signed announce payload and send it to a tracker you trust.

## What “Post-Quantum Signed Fingerprint” Means

PostSnail signs canonical post records and the final manifest with ML-DSA-65, a post-quantum signature algorithm standardized by NIST FIPS 204. It hashes canonical records and generated files with SHA3-512. The bundle fingerprint is a `psn1-sha3-512-...` digest over the manifest’s file and post proof set.

This proves that the exported content matches the signed manifest and publisher public key. It does not prove legal identity, truthfulness, or that the JavaScript runtime itself is FIPS-validated.

## Discovery and Trackers

PostSnail sites are self-authenticating static bundles. A tracker is only an optional search/discovery service: it fetches the public `.well-known` identity document and manifest, verifies signatures and fingerprints, then indexes compact public summaries.

Creators remain the source of truth through their own domain and signed proof files. See [tracker protocol notes](docs/tracker-protocol.md).

## Privacy and Recovery

- The private signing key is encrypted with your passphrase before being stored in IndexedDB.
- Losing the passphrase means PostSnail cannot decrypt the signing key.
- Export a backup after creating your identity and after meaningful publishing sessions.
- Image files are copied into the ZIP as selected; strip EXIF/GPS metadata before importing images if that matters for your threat model.

More detail: [Cloudflare Pages guide](docs/cloudflare-pages.md) and [recovery/proof notes](docs/recovery-and-proof.md).
