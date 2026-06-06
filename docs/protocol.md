# PostSnail Protocol

PostSnail uses a stable core plus optional extensions. The public website ZIP is the signed publishing artifact. The encrypted `.postsnail` Shell is the private editable source.

## Protocol Constants

Alpha 1 uses:

```js
POSTSNAIL_PROTOCOL = "postsnail"
POSTSNAIL_PROTOCOL_VERSION = 1
CURRENT_MANIFEST_VERSION = 1
CURRENT_IDENTITY_VERSION = 1
CURRENT_COMMIT_VERSION = 1
CURRENT_WORKSPACE_VERSION = 1
```

The legacy protocol string `postsnail-v1` remains accepted for older valid exports.

## Feature Declarations

Major protocol files can declare compatibility metadata:

```json
{
  "protocol": "postsnail",
  "version": 1,
  "requiredFeatures": ["signed-manifest", "file-hashes"],
  "optionalFeatures": ["sitemap", "commit-history"],
  "extensions": {}
}
```

Rules:

- Unknown optional feature: ignore safely.
- Unknown optional extension: preserve where practical, do not interpret.
- Unknown required feature: fail clearly.
- Missing optional feature: continue.
- Never change the meaning of an old field.

## Public Manifest

`postsnail.manifest.json` is the public proof root. It declares the generator, site metadata, public key, signed post records, file digests, bundle fingerprint, and manifest signature.

The manifest uses `manifestVersion` for the manifest schema and `version` for the protocol compatibility declaration.

## Well-Known Identity

`.well-known/postsnail.json` is registry-ready public metadata. It points to the public manifest and declares the current bundle fingerprint. It is signed by the publisher key when identity proof is present.

Trackers should verify this file before fetching larger proof data.

## Commit Proofs

`.well-known/postsnail/latest-commit.json` and `.well-known/postsnail/commits.json` are optional commit-history files. Their absence is a legacy warning, not a fatal error.

## Workspace Vault

`.postsnail` files are encrypted JSON envelopes. The visible header contains non-secret metadata and compatibility declarations; the ciphertext contains the editable workspace payload.

The workspace schema has its own version and migration path. A public ZIP must never include the `.postsnail` vault, drafts, private plugin state, rejected comments, raw keys, or recovery data.

## Tracker Announce

`postsnail-announce` payloads are public signed refresh signals. They help Forest notice that a live site changed. They are not accounts, ownership claims, or private-key transport.

## ShellNames

`postsnail-shellname` records are optional signed public aliases such as `@creator@forest.postsnail.org`. They point to a public PostSnail signing key and microblog URL. They are not accounts, DNS, legal identity, or ownership claims.

ShellName metadata may appear in `postsnail.manifest.json` and `.well-known/postsnail.json` under the optional `shellnames` feature. Older tools ignore it safely.

## Recovery Boundary

Importing `.postsnail` restores the real project. Importing a public ZIP or site can only recover public content and public proof files.
