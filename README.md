# PostSnail Alpha 2

PostSnail Alpha 2 has two public surfaces:

- `https://postsnail.org/` is the project website, manifesto, media kit, docs, and entry point to the browser admin.
- `https://forest.postsnail.org/` is PostSnail Forest, the searchable tracker where creators register published PostSnail sites.

The admin lives at `/admin/`. It is browser-native software for publishing a creator-owned static microblog. It keeps editable browser-local Shell data encrypted at rest, stores encrypted workspace vaults and encrypted publisher keys locally, then downloads a static ZIP that can be published with Surge or uploaded to any plain static host.

PostSnail has two exports:

1. Encrypted Workspace (`.postsnail`) for the creator. This is the private editable source.
2. Public Website ZIP (`.zip`) for publishing. This is static public output, not the full project source.

The exported site includes:

- `index.html`, archive, tag, post, about, sitemap, RSS, and JSON feed files.
- `postsnail.manifest.json` with file hashes, post records, post signatures, manifest signature, and bundle fingerprint.
- `.well-known/postsnail.json` as a signed identity/discovery document bound to the creator domain when a site URL is set.
- `.well-known/postsnail/latest-commit.json` and `.well-known/postsnail/commits.json` with signed export history.

PostSnail does not require a backend, submit automatically to a registry, upload files, or create accounts.

## Alpha 2 Highlights

Alpha 2 is the first lean release after the prototype cleanup pass. The repo now keeps the real deployable surfaces clear: the public website/admin, the browser-native Shell workflow, direct CLI automation, the Surge bridge, and the Forest Worker in `registry/`.

- The browser admin remains the primary local creator interface.
- The CLI remains available for direct, explicit automation commands.
- SnailLift is Surge-only for hosted publishing, with Download Website ZIP still available as the universal fallback.
- Official bundled extensions remain declarative: install/enable changes state, but no third-party plugin code is loaded.
- Old packaging experiments, old experimental Forest, mock package, and pre-Surge provider prototypes were removed from tracked code.
- Public docs, package metadata, and generated proof metadata now identify the release as Alpha 2 / `0.2.0`.

See [Alpha 2 release notes](docs/alpha-2.md).

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
3. Open Generate and export an encrypted `.postsnail` Shell.
4. Use the SnailLift Surge setup card to enter your site URL, domain, project folder, login, and token.
5. Keep the credentials inside the encrypted Shell.
6. Click `Publish to Surge` to publish through the local bridge, or click `Export Website ZIP` if you want the static fallback.
7. PostSnail builds the public files, runs local safety checks, publishes through the Surge bridge, verifies the live proof files, and notifies Forest only after verification passes.
8. Open Verify and choose the ZIP to validate it locally if you used the fallback path or want an extra local proof check.

## PostSnail CLI

PostSnail CLI is the trusted local automation interface for PostSnail. It reuses the same workspace, proof, export, and verification logic as the browser admin instead of inventing a second publishing model.

CLI commands include:

- `postsnail workspace create|info|migrate`
- `postsnail profile show|set`
- `postsnail identity generate|show`
- `postsnail plugin list|enable|disable`
- `postsnail post list|new|import|status|delete`
- `postsnail page list|import|status|delete|navigation`
- `postsnail asset list|unused|delete-unused`
- `postsnail comment verify|approve|reject|list|block-key`
- `postsnail build`, `postsnail zip`, `postsnail verify`, and `postsnail live verify`
- `postsnail publish surge`
- `postsnail forest announce`
- `postsnail shellname register|update|renew`
- `postsnail domain move|mirror`

Important boundary: the CLI uses two different passphrases when a signing identity exists.

- The Shell passphrase opens the encrypted `.postsnail` file.
- The identity passphrase unlocks the encrypted signing key for `build` and `zip`.

CLI workflows stay local-first. Publish, Forest, ShellName, and domain-move commands send only public signed records or public generated files; they do not upload raw private keys, Shell passphrases, drafts, rejected comments, or private plugin state. See [CLI](docs/cli.md) and [Headless Publishing](docs/headless-publishing.md).

## SnailLift

SnailLift is PostSnail's optional deployment assistant. It prepares the public Website ZIP output for deployment, runs the public export safety check, prepares the Surge publish step through the local bridge, verifies the live proof files, and only then notifies Forest.

SnailLift is built in for Alpha 2 but isolated from PostSnail Core. Provider-specific deployment code lives under `src/snaillift/`; exporter, workspace, identity, manifest, protocol, and signing modules stay provider-neutral so SnailLift can later move to `plugins/postsnail-snaillift`.

SnailLift is not hosting. Download ZIP remains the fallback. See [SnailLift](docs/snaillift.md), [SnailLift Surge](docs/snaillift-surge.md), [SnailLift Security](docs/snaillift-security.md), and [Publishing](docs/publishing.md).

## What “Post-Quantum Signed Fingerprint” Means

PostSnail signs canonical post records and the final manifest with ML-DSA-65, a post-quantum signature algorithm standardized by NIST FIPS 204. It hashes canonical records and generated files with SHA3-512. The bundle fingerprint is a `psn1-sha3-512-...` digest over the manifest’s file and post proof set.

This proves that the exported content matches the signed manifest and publisher public key. It does not prove legal identity, truthfulness, or that the JavaScript runtime itself is FIPS-validated.

## Discovery and Trackers

PostSnail sites are self-authenticating static bundles. PostSnail Forest is only a search/discovery service: it fetches the public `.well-known` identity document and manifest, verifies signatures and fingerprints, then indexes compact public summaries.

After a creator publishes a new ZIP, the admin can send Forest a signed public announce. Forest checks the live `.well-known/postsnail.json` fingerprint first and only queues a full crawl when the fingerprint changed. If the creator forgets, Forest also runs capped scheduled checks that back off quiet sites toward daily checks.

Creators remain the source of truth through their own domain and signed proof files. See the public docs at `/docs/architecture/` and the repo notes in [tracker protocol notes](docs/tracker-protocol.md).

## ShellNames

ShellNames are readable Forest aliases like `@creator@forest.postsnail.org`. They point to a public PostSnail signing key and microblog URL, but they are not accounts, DNS, legal identity, or ownership claims.

Creators can claim, update, and renew ShellNames from the admin Identity tab after unlocking the publisher key. The admin signs the public ShellName record locally and sends only that public record to Forest. Accepted ShellNames are stored inside the encrypted `.postsnail` Shell and can appear as optional public metadata in generated proof files. See [ShellNames](docs/shellnames.md), [ShellNames Protocol](docs/shellnames-protocol.md), and [ShellNames Security](docs/shellnames-security.md).

## Site Moves

When a creator changes domains, Forest should not keep showing dead old post URLs forever, but it also should not guess. The admin Identity tab includes `Change Domain`, which signs a `postsnail-site-move` record after the new live site verifies with the same publisher key and bundle fingerprint.

`Move to new domain` hides the old indexed domain from Forest search and stores a public audit row. `Keep old domain as mirror` stores the relationship while leaving both domains visible. Accepted move records stay in the encrypted Shell and are published in manifest/well-known metadata only if the creator enables move-history publishing. See [Site Moves](docs/site-moves.md).

## Compatibility Contract

PostSnail uses a stable-core, optional-extension model so old valid Shells and old valid public ZIP exports keep working as the protocol grows.

- Stable protocol records use `protocol: "postsnail"` and `version: 1`.
- Old `postsnail-v1` proof records remain accepted when their signatures, hashes, and shape are valid.
- Unknown optional fields and `extensions` are ignored safely.
- Unknown required features fail clearly.
- Missing newer optional files, such as commit history or sitemap, produce legacy warnings instead of fatal errors.
- Workspace upgrades use deterministic migrations, and unsupported future workspace versions fail with a clear newer-version message.

Future protocol-risk changes should go through a PostSnail Enhancement Proposal. See [compatibility](docs/compatibility.md), [protocol](docs/protocol.md), and [PSEP process](docs/psep.md).

## Core Foundation

PostSnail Core owns the stable local Shell, public ZIP, proof, migration, plugin/theme manifest, route asset, and export safety boundaries. Product areas such as SnailLift, ShellNames, Pages, Comments, Forest UX, Canopy, and ShellSeed stay outside Core unless they change those boundaries.

The Core Foundation APIs live under `src/core/` and cover plugin manifest validation, permission validation, plugin registry state, deterministic hook planning, plugin migrations, theme manifest validation, theme registries, route-scoped asset maps, and public export safety checks. See [Core Foundation](docs/core-foundation.md), [plugin system](docs/plugin-system.md), [plugin migrations](docs/plugin-migrations.md), [theme system](docs/theme-system.md), [theme manifests](docs/theme-manifests.md), [route assets](docs/route-assets.md), [permission model](docs/permissions.md), and [extension security](docs/extension-security.md).

Alpha 2 extension support is intentionally declarative. PostSnail can install/enable official plugin manifests, preserve plugin state, plan hooks, and declare route assets, but it does not load third-party plugin packages or run arbitrary plugin code.

The admin Extensions tab currently supports official bundled plugins only. `postsnail-comments` adds signed comment moderation and approved static replies, `postsnail-snaillift` reveals the SnailLift deployment assistants while keeping Download ZIP available as the universal fallback, and `postsnail-pages` adds the Pages tab for static pages, docs, navigation, and homepage override while keeping CMS state inside the encrypted Shell.

See [PostSnail Comments](docs/comments.md) and [PostSnail Pages](docs/postsnail-pages.md) for the current official plugin boundaries.

## Privacy and Recovery

- Browser-local editable Shell data is encrypted in IndexedDB and requires the Shell passphrase to reopen.
- The private signing key is separately encrypted with its own passphrase inside the Shell identity object.
- Losing the passphrase means PostSnail cannot decrypt the signing key.
- Export an encrypted `.postsnail` Shell after creating your identity and after meaningful publishing sessions.
- Move to another computer by importing the `.postsnail` workspace in the new browser, unlocking the publisher key, and exporting a new public Website ZIP.
- A published ZIP or public site can only recover public content. It cannot recover private keys, drafts, private plugin state, rejected comments, or moderation notes.
- Image files are copied into the ZIP as selected; strip EXIF/GPS metadata before importing images if that matters for your threat model.

More detail: [workspace vaults](docs/workspace-vault.md), [Surge publish guide](docs/publish-surge.md), [security notes](docs/security.md), [workspace migrations](docs/migrations.md), and [recovery/proof notes](docs/recovery-and-proof.md).

## License And Attribution

PostSnail is licensed under Apache-2.0. Redistributed copies, forks, and derivative works must preserve the Apache-2.0 license and the `NOTICE` attribution to Boaz Alhadeff and the original PostSnail project.

The shipped browser dependencies are open-source and listed in [third-party notices](THIRD_PARTY_NOTICES.md). No proprietary third-party code was found in the shipped vendored dependency set during the Alpha 2 review. The supplied/generated logo assets are assumed to be owned or cleared by Boaz Alhadeff.

## Forest Cost Notes

Forest JSON API usage can consume Cloudflare resources. Search and site lookups use Workers and D1 reads; submissions and announces use D1 rate-limit reads/writes plus Queue operations when a crawl is needed. Scheduled freshness checks use Worker requests and cheap `.well-known` fetches first, then run full manifest/post verification only after a bundle fingerprint change. Cloudflare Free plan limits can fail closed when exhausted, while Workers Paid usage can create overage billing if abused. For production, keep app-level limits and add Cloudflare dashboard/WAF rate rules for `/api/search`, `/api/submit`, and `/api/announce`.
