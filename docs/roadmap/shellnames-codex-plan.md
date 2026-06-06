# ShellNames — PostSnail Forest Alias Registry Plan

## Purpose

ShellNames is a forest-scoped signed alias registry for PostSnail shells.

It solves this problem:

> Not every creator has a DNS domain, but every creator still needs a human-readable way to be found.

ShellNames does **not** replace DNS. It gives a readable forest name to a cryptographic PostSnail shell.

Example:

```txt
@elmirok@forest.postsnail.org
```

This resolves to a signed ShellName record pointing to:

- shell ID
- public key
- display profile
- optional static site URL
- optional manifest URL
- optional tracker profile
- optional mirrors/locations

The shell key remains the real identity. The ShellName is only a readable alias inside a forest.

---

## Core Principle

```txt
Shell ID = permanent cryptographic identity
ShellName = readable forest alias
Domain = optional stronger web identity
Forest = discovery layer, not owner
```

The forest may help people find the shell, but it must never own the creator identity.

---

## Codex Goal

Work in the PostSnail / Forest tracker ecosystem.

Goal: implement **ShellNames**, a forest-scoped signed alias registry for PostSnail creators who do not have DNS domains or who want a readable forest alias.

Do not ask questions. Make safe decisions, implement an MVP, test, and document.

---

## Product Model

A creator can claim a name like:

```txt
@name@forest.postsnail.org
```

The name resolves to a signed ShellName record.

The record is signed by the creator’s PostSnail shell key.

A user can later add a normal website/domain, but the shell key remains the stable identity.

---

## Required Features

### 1. ShellName Record Format

Create a versioned record:

```json
{
  "protocol": "shellnames-v1",
  "type": "shellname_record",
  "forest": "forest.postsnail.org",
  "name": "elmirok",
  "fullName": "@elmirok@forest.postsnail.org",
  "shellId": "psn1-...",
  "publicKey": "base64:...",
  "displayName": "Elmirok",
  "bio": "",
  "avatarUrl": "",
  "locations": [
    {
      "type": "static-site",
      "url": "https://elmirok.hilazon6.com",
      "manifestUrl": "https://elmirok.hilazon6.com/postsnail.manifest.json"
    },
    {
      "type": "forest-profile",
      "url": "https://forest.postsnail.org/@elmirok"
    }
  ],
  "preferredTrackers": [],
  "createdAt": "",
  "updatedAt": "",
  "expiresAt": "",
  "requiredFeatures": ["signed-name-record"],
  "optionalFeatures": ["static-site", "avatar", "tracker-profile"],
  "signatureSuite": "ML-DSA-65",
  "digestSuite": "SHA3-512",
  "signature": "base64:..."
}
```

The signature signs canonical JSON without the `signature` field.

---

### 2. Registration Flow

Implement:

```txt
POST /shellnames/register
```

Input:

- desired name
- ShellName record
- signature
- proof that requester controls the shell public key

Rules:

- name must be lowercase
- allow only `a-z`, `0-9`, `_`, `-`
- length: 3–32 chars
- reserve admin/system names
- reject duplicate active names
- require signed record
- optional proof-of-work placeholder for future spam control

---

### 3. Resolve Flow

Implement:

```txt
GET /shellnames/:name.json
GET /@/:name.json
GET /@:name
```

The JSON endpoint returns the signed record.

The profile page displays:

- display name
- full ShellName
- shell ID
- public key fingerprint
- bio
- latest known site/manifest if available
- verification status
- locations
- renewal/expiry status

---

### 4. Update Flow

Implement:

```txt
POST /shellnames/update
```

Only the shell key that owns the name can update the record.

Allow updates to:

- displayName
- bio
- avatarUrl
- static site URL
- manifest URL
- locations
- preferred trackers

The update must be signed by the same shell key.

---

### 5. Renewal / Expiry

Names should not be permanent by default.

Implement:

- `createdAt`
- `updatedAt`
- `expiresAt`
- yearly renewal model
- signed renewal by the same shell key
- expired names become inactive after grace period
- keep historical record for audit if practical

Endpoint:

```txt
POST /shellnames/renew
```

---

### 6. Search / Directory

Add directory endpoints:

```txt
GET /shellnames/recent.json
GET /shellnames/search?q=
GET /shellnames/export.json
```

Search by:

- name
- display name
- shell ID
- domain/site URL
- tags later

---

### 7. Forest Tracker Integration

Integrate ShellNames into the Forest tracker UI.

Forest should show:

- creators with domains
- creators with only ShellNames
- verified static sites
- shell-only profiles
- alias → shell mapping

A creator without a website can still have:

```txt
https://forest.postsnail.org/@name
```

This is not their canonical website. It is a forest profile.

---

### 8. PostSnail Admin Integration

Add optional ShellNames panel in PostSnail Admin.

Features:

- claim ShellName
- update ShellName
- renew ShellName
- copy ShellName
- add ShellName to workspace
- add ShellName to public manifest / identity doc
- warn that forest aliases are not DNS ownership

Workspace should store:

```json
{
  "shellNames": [
    {
      "forest": "forest.postsnail.org",
      "name": "elmirok",
      "fullName": "@elmirok@forest.postsnail.org",
      "record": {}
    }
  ]
}
```

The public site may include ShellNames in:

- `postsnail.manifest.json`
- `.well-known/postsnail.json`

---

### 9. Security Rules

ShellNames must not become central identity ownership.

Rules:

- shell public key is the real identity
- forest alias is only a pointer
- all name records must be signed
- forest cannot silently change a record without invalidating signature
- clients should verify signatures
- unknown optional fields are ignored
- unknown required features fail safely
- domain verification is separate from ShellName verification

---

### 10. Abuse / Squatting Controls

MVP controls:

- reserved names list
- rate limit by IP
- rate limit by public key
- one name per shell by default, configurable
- expiry/renewal
- public dispute policy doc
- admin moderation flag
- tombstone records for banned names if needed

Reserved examples:

```txt
admin
root
postsnail
forest
support
api
www
mail
null
undefined
```

---

### 11. Docs

Create or update:

```txt
docs/shellnames.md
docs/shellnames-protocol.md
docs/shellnames-security.md
docs/forest.md
docs/protocol.md
README.md
```

Docs must explain:

- ShellNames are not DNS
- ShellNames are forest-scoped aliases
- shell key remains the real identity
- people without domains can still be discovered
- `@name@forest.postsnail.org` format
- how to claim/update/renew
- what a ShellName proves
- what it does not prove
- how clients verify signed records
- abuse and squatting policy

---

### 12. Tests

Add tests for:

- valid name accepted
- invalid name rejected
- duplicate active name rejected
- reserved name rejected
- signed record verifies
- tampered record fails
- update by owner key succeeds
- update by different key fails
- expired name marked inactive
- renewal extends expiry
- resolve endpoint returns signed record
- export endpoint includes records
- unknown optional field ignored
- unknown required feature fails
- PostSnail manifest can include ShellNames

---

## Acceptance Criteria

Done when:

1. Creator can claim a ShellName.
2. ShellName resolves to a signed record.
3. Forest profile page exists for claimed names.
4. Creator can update their record with the shell key.
5. Duplicate/reserved names are blocked.
6. Expiry/renewal model exists.
7. Records are exportable.
8. Clients can verify signatures.
9. PostSnail Admin can store/display ShellNames.
10. Docs explain the model clearly.
11. Tests cover registration, resolution, update, expiry, and signature checks.

---

## Future Ideas

Later versions can add:

- multiple forests
- cross-forest alias discovery
- DID export
- WebFinger-compatible endpoint
- Nostr NIP-05-style mapping
- domain verification upgrade
- proof-of-work anti-spam
- name transfer
- dispute policy UI
- federated ShellName sync
- QR identity cards

---

## Design Inspirations

ShellNames should learn from existing systems without copying their complexity:

- WebFinger: discovery of information about people or things using identifiers such as `acct:` URIs.
- AT Protocol: stable identity plus mutable human-readable handle.
- Nostr: public key identity with optional human-readable aliases.
- Well-known URIs: predictable metadata locations under `/.well-known/`.

ShellNames should stay simpler:

```txt
No blockchain.
No global scarce-name market.
No mandatory DNS.
No central login.
No forest ownership of identity.
```

---

## Final Product Sentence

ShellNames gives every PostSnail creator a readable forest alias without taking away ownership.

```txt
The shell key is the identity.
The ShellName is the path.
The forest is discovery.
```
