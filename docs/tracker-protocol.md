# PostSnail Tracker Protocol

PostSnail trackers are optional discovery services. They help people find public microblogs, but they are not the source of truth. The creator's domain, signed `.well-known/postsnail.json`, signed manifest, post proofs, and commit history remain authoritative.

Trackers should be serverless-friendly: dynamic writes for announcements and crawls, static or cacheable reads for indexes. A tracker may verify, index, gossip, and export compact public records, but it must not require accounts, private keys, analytics scripts, or creator-side backends.

## Trust Model

- Creator domain plus signed proof metadata is the source of truth.
- Trackers verify public keys, identity signatures, manifest signatures, post digests, and bundle fingerprints before indexing.
- Trackers store compact public summaries only: site metadata, post titles, tags, excerpts, dates, URLs, digests, public key, and bundle fingerprint.
- Trackers can be forked, mirrored, or ignored. A creator can announce to zero, one, or many trackers.
- Full ZIP verification remains a browser/admin verifier workflow.

## Endpoints

### `POST /announce`

Accepts a signed JSON payload created by PostSnail after export. The tracker validates the payload shape, fetches the creator's `.well-known/postsnail.json`, fetches the manifest, verifies key consistency and signatures, then stores a compact record.

### `GET /health`

Returns service status:

```json
{ "ok": true, "service": "postsnail-tracker", "protocol": "postsnail-v1" }
```

### `GET /recent.json`

Returns recently verified blogs as compact public records.

### `GET /blogs/:domain.json`

Returns the current compact record for one indexed creator domain.

### `GET /export/blogs.json`

Returns all compact public records for static mirroring, backups, or other tracker import flows.

## Announce Payload

The creator signs the canonical JSON payload without `signature` using ML-DSA-65:

```json
{
  "type": "postsnail-announce",
  "protocol": "postsnail-v1",
  "siteUrl": "https://creator.example/",
  "domain": "creator.example",
  "wellKnownUrl": "https://creator.example/.well-known/postsnail.json",
  "manifestUrl": "https://creator.example/postsnail.manifest.json",
  "bundleFingerprint": "psn1-sha3-512-...",
  "publicKey": "base64:...",
  "generatedAt": "2026-06-05T00:00:00.000Z",
  "signatureSuite": "ML-DSA-65",
  "signature": "base64:..."
}
```

PostSnail copies the announce payload locally after export. It does not auto-send it.
