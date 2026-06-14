# PostSnail Site Moves

Site Moves let a creator tell Forest that a signed PostSnail site moved from one public domain to another.

They solve a practical problem: an old indexed domain can stay in Forest search after the creator has moved and deleted the old host. Those old results can point to dead pages or broken direct thumbnails. Forest should not guess that a domain moved just because another site has the same title or content, so PostSnail uses an explicit signed move record.

## What A Move Proves

A valid Site Move proves:

- the same publisher key that Forest indexed for the old site signed the move record;
- the new live site exposes valid PostSnail proof files;
- the new live proof uses the same public key;
- the new live bundle fingerprint matches the signed move record.

It does not prove legal domain ownership, legal identity, truth, or that the old domain should be deleted from the internet.

## Admin Flow

1. Publish the new Website ZIP to the new live domain.
2. Open the PostSnail Admin Identity tab.
3. Unlock the publisher signing key.
4. Enter the old domain and new live domain.
5. Choose `Move to new domain` or `Keep old domain as mirror`.
6. Click `Change Domain`.

PostSnail builds the current public export, verifies the new live proof files, signs a `postsnail-site-move` record locally, and sends only the public signed record to Forest.

## Modes

`move` hides the old indexed site and old posts from Forest search. Forest keeps a public audit record and sets the old indexed site status to `moved`.

`mirror` stores the relationship but leaves both old and new sites searchable. Use this when both hosts should remain valid mirrors.

## Signed Record

The signed payload is canonical JSON without the `signature` field:

```json
{
  "protocol": "postsnail-site-move",
  "version": 1,
  "mode": "move",
  "fromUrl": "https://old.example/",
  "toUrl": "https://new.example/",
  "publicKey": "base64:...",
  "bundleFingerprint": "psn1-sha3-512-...",
  "createdAt": "2026-06-14T00:00:00.000Z",
  "requiredFeatures": [],
  "optionalFeatures": ["forest-tracker"],
  "extensions": {}
}
```

Forest accepts the signed record at `POST /api/site-moves`.

## Public History

Accepted move records are stored in the encrypted Shell as `siteMoves`.

They are not published by default. If the creator enables move-history publishing, generated public proof files can include optional `siteMoves` metadata. Older verifiers ignore it safely through the optional `site-moves` feature.

## Forest Behavior

Forest never hides a site only because another site appears to be related. It requires:

- an old indexed site in D1;
- matching old indexed public key;
- valid signed move record;
- valid new live proof files;
- matching new live public key;
- matching bundle fingerprint.

Moved sites are hidden from search, not physically deleted.
