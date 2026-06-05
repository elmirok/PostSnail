# PostSnail Alpha 1

PostSnail Alpha 1 has two public surfaces:

- `https://postsnail.org/` is the project website, manifesto, media kit, docs, and entry point to the browser admin.
- `https://forest.postsnail.org/` is PostSnail Forest, the searchable tracker where creators register published PostSnail sites.

The admin lives at `/admin/`. It is browser-native software for publishing a creator-owned static microblog. It stores posts, images, encrypted workspace vaults, and encrypted publisher keys locally in the browser, then downloads a static ZIP that can be hosted on Cloudflare Pages, GitHub Pages, Netlify, or any plain static host.

PostSnail has two exports:

1. Encrypted Workspace (`.postsnail`) for the creator. This is the private editable source.
2. Public Website ZIP (`.zip`) for publishing. This is static public output, not the full project source.

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

Open `http://localhost:4173` for the public website or `http://localhost:4173/admin/` for the local-first admin.

## Deploy The Public Site And Admin

The repository contains tests, registry code, and development dependencies that must not be uploaded as static assets. Use the committed Wrangler config and package script:

```bash
npm install
npm run deploy
```

For Cloudflare connected deploys, set the deploy command to `npm run deploy`. The script first prepares `dist/postsnail-admin` with only public website, admin, docs, media kit, brand, verifier, source, and vendored browser assets, then deploys that directory.

## Publish Flow

1. Write at least one published post.
2. Generate or unlock the encrypted ML-DSA-65 publisher key.
3. Open Generate, enter a workspace passphrase, and export an encrypted `.postsnail` workspace.
4. Click `Export Website ZIP`.
5. Open Verify and choose the ZIP to validate it locally.
6. Unzip the bundle and upload its contents to a static host.
7. Register the public site on PostSnail Forest after it is live.

## What “Post-Quantum Signed Fingerprint” Means

PostSnail signs canonical post records and the final manifest with ML-DSA-65, a post-quantum signature algorithm standardized by NIST FIPS 204. It hashes canonical records and generated files with SHA3-512. The bundle fingerprint is a `psn1-sha3-512-...` digest over the manifest’s file and post proof set.

This proves that the exported content matches the signed manifest and publisher public key. It does not prove legal identity, truthfulness, or that the JavaScript runtime itself is FIPS-validated.

## Discovery and Trackers

PostSnail sites are self-authenticating static bundles. PostSnail Forest is only a search/discovery service: it fetches the public `.well-known` identity document and manifest, verifies signatures and fingerprints, then indexes compact public summaries.

Creators remain the source of truth through their own domain and signed proof files. See the public docs at `/docs/architecture/` and the repo notes in [tracker protocol notes](docs/tracker-protocol.md).

## Privacy and Recovery

- The private signing key is encrypted with your passphrase before being stored in IndexedDB.
- Losing the passphrase means PostSnail cannot decrypt the signing key.
- Export an encrypted `.postsnail` workspace after creating your identity and after meaningful publishing sessions.
- Move to another computer by importing the `.postsnail` workspace in the new browser, unlocking the publisher key, and exporting a new public Website ZIP.
- A published ZIP or public site can only recover public content. It cannot recover private keys, drafts, private plugin state, rejected comments, or moderation notes.
- Image files are copied into the ZIP as selected; strip EXIF/GPS metadata before importing images if that matters for your threat model.

More detail: [workspace vaults](docs/workspace-vault.md), [Cloudflare Pages guide](docs/cloudflare-pages.md), [security notes](docs/security.md), [workspace migrations](docs/migrations.md), and [recovery/proof notes](docs/recovery-and-proof.md).

## License And Attribution

PostSnail is licensed under Apache-2.0. Redistributed copies, forks, and derivative works must preserve the Apache-2.0 license and the `NOTICE` attribution to Boaz Alhadeff and the original PostSnail project.

The shipped browser dependencies are open-source and listed in [third-party notices](THIRD_PARTY_NOTICES.md). No proprietary third-party code was found in the shipped vendored dependency set during the Alpha 1 review. The supplied/generated logo assets are assumed to be owned or cleared by Boaz Alhadeff.

## Forest Cost Notes

Forest JSON API usage can consume Cloudflare resources. Search and site lookups use Workers and D1 reads; submissions also use D1 writes and Queue operations. Cloudflare Free plan limits can fail closed when exhausted, while Workers Paid usage can create overage billing if abused. For production, keep app-level submit limits and add Cloudflare dashboard/WAF rate rules for `/api/search` and `/api/submit`.
