# ShellNames Protocol

ShellNames use signed public records with their own protocol type:

```json
{
  "protocol": "postsnail-shellname",
  "version": 1,
  "name": "creator",
  "forest": "forest.postsnail.org",
  "fullName": "@creator@forest.postsnail.org",
  "siteUrl": "https://creator.example/",
  "publicKey": "base64:...",
  "bundleFingerprint": "psn1-sha3-512-...",
  "createdAt": "2026-06-05T00:00:00.000Z",
  "requiredFeatures": [],
  "optionalFeatures": ["forest-tracker"],
  "extensions": {},
  "signature": "base64:..."
}
```

The `signature` is ML-DSA-65 over the canonical JSON record without the signature field.

## Forest Endpoints

- `POST /shellnames/register`
- `POST /shellnames/update`
- `POST /shellnames/renew`
- `GET /shellnames/:name.json`
- `GET /@/:name.json`
- `GET /@:name`
- `GET /shellnames/search?q=`
- `GET /shellnames/recent.json`
- `GET /shellnames/export.json`

Forest normalizes names to lowercase and accepts `a-z0-9_-` names from 3 to 32 characters. Reserved system names are rejected.

## Compatibility

ShellNames are optional extension metadata in PostSnail public proofs. Unknown optional ShellName fields and extensions are ignored safely. Unknown required features fail clearly.

## Search

Forest search returns ShellName results under `scope=all` and `scope=shell`. ShellName search is summary-only and does not index private `.postsnail` data.
