# ShellSeed — Decentralized Hosting / Seeding Codex Plan

## Roadmap Item

**12. ShellSeed Decentralized Hosting / Seeding**

## Priority

Experimental / Later

ShellSeed should be built after:

```txt
1. PostSnail Core Foundation
2. Compatibility / migrations / PSEP rules
3. SnailLift
4. ShellNames
5. Plugin System Core + Theme System Spec
6. PostSnail Pages / CMS Plugin
7. PostSnail Comments
8. PostSnail CLI / Headless Publisher
9. Forest UX polish
```

Do not build ShellSeed too early. It depends on stable signing, bundle fingerprints, ShellNames, resolver logic, Forest registry, and safe public export rules.

---

# Purpose

ShellSeed is the decentralized hosting and seeding layer for PostSnail.

It allows creators and supporters to host signed PostSnail public bundles without relying on one central hosting provider.

The goal is to let people support creators not only with attention, but also with:

```txt
bandwidth
storage
availability
mirrors
community seeding
```

Product sentence:

> ShellSeed lets supporters host the trail without owning the shell.

---

# Core Philosophy

```txt
Shell ID = cryptographic identity
ShellName = readable forest-scoped alias
Bundle fingerprint = exact signed public content release
ShellSeed = decentralized hosting / seeding
Forest = resolver and discovery layer
```

ShellSeed must not replace PostSnail signatures, ShellNames, DNS, or Forest.

It should only help distribute public signed bundles.

---

# What ShellSeed Solves

## 1. Decentralized Hosting

PostSnail can already be hosted almost anywhere:

```txt
Cloudflare Pages
GitHub Pages
Netlify
Vercel
static web hosts
custom domains
```

ShellSeed adds another option:

```txt
local seeding
supporter seeding
community mirrors
P2P-style bundle distribution
optional IPFS mirrors
```

## 2. No-Domain Discovery

A creator without DNS can still be found through:

```txt
ShellName
Shell ID
Forest profile
latest signed bundle
seed registry
```

Example:

```txt
@boaz@forest.postsnail.org
```

resolves to:

```txt
Shell ID
latest bundle fingerprint
available seeders
optional mirrors
```

## 3. Supporter CDN

Supporters can run a seeder:

```bash
postsnail seed follow @creator@forest.postsnail.org
```

This means:

```txt
download latest public bundle
verify it
serve it
help the creator stay available
```

---

# Important Non-Goals

ShellSeed is not:

```txt
a hosting company
a DNS replacement
a global username registry
a blockchain naming system
a private workspace sync system
a MailSnail messaging layer
a generic file sharing system
a CDN for arbitrary files
```

It only serves verified public PostSnail bundles.

---

# Architecture

```txt
Creator PostSnail Export
   ↓
Signed public bundle
   ↓
Bundle fingerprint
   ↓
Seed record
   ↓
Forest seed registry
   ↓
Seeders / mirrors
   ↓
Reader resolver
   ↓
Download + verify
   ↓
Render/open site
```

---

# Key Concepts

## ShellSeed Bundle

A public signed PostSnail export.

It may be:

```txt
public ZIP
public static folder
content-addressed bundle
public mirror
IPFS CID later
```

It must never contain:

```txt
.postsnail workspace
private keys
drafts
rejected comments
private plugin state
secrets
tokens
.env
```

---

## Bundle Fingerprint

The exact public release identity.

Example:

```txt
psn1-sha3-512-abc123...
```

The bundle fingerprint tells readers:

```txt
This is the exact signed release.
```

If the creator publishes again, the bundle fingerprint changes.

---

## Seeder

A seeder is a node, app, browser, local CLI, NAS, server, or future WebRTC peer that serves a verified public bundle.

Seeder rule:

```txt
Seeders are not trusted.
The bundle is trusted only after verification.
```

---

## Seed Registry

The Forest stores public seed records.

The seed registry answers:

```txt
Who is seeding bundle X?
What is the latest known bundle for shell Y?
What seeders are available for @name@forest?
```

---

## Resolver

A resolver turns:

```txt
@name@forest.postsnail.org
```

or:

```txt
psn1-shell-id
```

into:

```txt
latest verified bundle
available seeders
public manifest
download options
verification status
```

---

# Seed Record Format

Create a signed seed record:

```json
{
  "protocol": "shellseed-v1",
  "type": "seed_record",
  "shellId": "psn1-...",
  "publicKey": "base64:...",
  "siteTitle": "",
  "shellNames": ["@name@forest.postsnail.org"],
  "bundleFingerprint": "psn1-sha3-512-...",
  "manifestHash": "sha3-512:...",
  "manifestUrl": "",
  "locations": [
    {
      "type": "http-seed",
      "url": "https://seed.example/bundles/psn1-..."
    },
    {
      "type": "local-seed",
      "url": "http://127.0.0.1:8787/bundles/psn1-..."
    },
    {
      "type": "ipfs",
      "cid": ""
    }
  ],
  "createdAt": "",
  "expiresAt": "",
  "signatureSuite": "ML-DSA-65",
  "digestSuite": "SHA3-512",
  "signature": "base64:..."
}
```

The signature signs canonical JSON without the `signature` field.

---

# Local Safe Seeder CLI

Add a CLI command:

```bash
postsnail seed serve --bundle ./public-site.zip --port 8787
```

The local seeder must:

```txt
verify bundle before serving
serve only public export files
serve by bundle fingerprint
run in read-only mode
block private files
block path traversal
support bandwidth limits
support storage limits
write safe logs
```

Endpoints:

```txt
GET /health
GET /bundles/:fingerprint/manifest
GET /bundles/:fingerprint/files/:path
GET /bundles/:fingerprint/bundle.zip
GET /bundles/:fingerprint/seed-record.json
```

---

# Seeder Safety Rules

The seeder must refuse to serve:

```txt
.postsnail
*.postsnail
backup JSON
raw private keys
encrypted workspace payloads
drafts/
rejected-comments/
private-plugin-state/
.env
secrets
tokens
../ path traversal
absolute paths
```

The seeder must serve only files proven to belong to the public export.

---

# Forest Seed Registry

Extend Forest with seed registry endpoints:

```txt
POST /seed-records
GET /seed-records/:bundleFingerprint.json
GET /shells/:shellId/seeds.json
GET /shellnames/:name/seeds.json
GET /seeders/recent.json
```

Forest behavior:

```txt
accept signed seed records
verify seed record signature
verify shell public key
fetch manifest if possible
verify bundle fingerprint if possible
store active seeders
expire stale seed records
show seeder count in Forest UI
never trust seeders blindly
```

---

# Resolver CLI

Add resolver logic:

```bash
postsnail resolve @name@forest.postsnail.org
postsnail resolve psn1-...
```

Resolution flow:

```txt
1. Resolve ShellName to Shell ID.
2. Get latest signed manifest/bundle fingerprint.
3. Get seed records for latest bundle.
4. Pick best source.
5. Download manifest/files/bundle.
6. Verify hashes/signatures.
7. Return local verified path or status.
```

If no seeder exists, show a clear message.

---

# Supporter Seeding Mode

Add future-ready command:

```bash
postsnail seed follow @creator@forest.postsnail.org
```

MVP behavior:

```txt
resolve creator
download latest public bundle
verify it
seed it locally
check for updates manually
```

Future behavior:

```txt
run as daemon
auto-check for new releases
auto-download verified bundles
seed latest N versions
bandwidth/storage limits
supporter stats
```

---

# Handle Passport

Create a signed preferred handle document.

This does not guarantee global uniqueness. It helps creators request the same handle across multiple forests.

```json
{
  "protocol": "postsnail-handle-passport-v1",
  "type": "handle_passport",
  "preferredHandle": "boaz",
  "shellId": "psn1-...",
  "publicKey": "base64:...",
  "knownForests": [
    "@boaz@forest.postsnail.org"
  ],
  "createdAt": "",
  "updatedAt": "",
  "signatureSuite": "ML-DSA-65",
  "signature": "base64:..."
}
```

Rules:

```txt
Shell ID is the true identity.
Forest-scoped ShellName is the readable identity.
Handle Passport is a preference/request, not ownership.
Forests may honor or reject the handle.
```

---

# Username / Handle Policy

Use forest-scoped names.

Example:

```txt
@boaz@forest.postsnail.org
@boaz@puddleofmud.snailsden.is
```

These can be different people.

Duplicate handles are blocked only inside the same forest.

No global unique username system in MVP.

Reserved names:

```txt
admin
root
postsnail
forest
shellnames
shellseed
api
www
support
null
undefined
```

Policy:

```txt
names are forest-scoped
no global monopoly names
same handle across forests cannot be guaranteed
cross-forest consistency is best-effort through Handle Passport
annual renewal
signed renewal by shell key
public dispute policy
```

---

# Optional IPFS Mirror

Support optional IPFS fields in seed records.

Rule:

```txt
IPFS is a mirror option, not the identity system.
PostSnail signatures remain the trust layer.
```

Do not require IPFS for MVP.

---

# Browser P2P Later

Document future WebRTC browser seeding, but do not require it for MVP.

Future architecture:

```txt
PostSnail Admin announces online peer
Forest helps signaling
browser serves bundle chunks via WebRTC
supporters can seed from browser temporarily
```

MVP should use:

```txt
local HTTP seeder + Forest registry
```

first.

---

# Incentives

Do not start with crypto or money.

MVP incentives:

```txt
supporter badge
bandwidth contributed
storage contributed
seed uptime
creator thank-you page
forest seeder count
well-seeded badge
```

Future:

```txt
paid supporter nodes
community seed pools
creator memberships
bandwidth credits
```

---

# Code Structure

Suggested structure:

```txt
src/shellseed/
  protocol.js
  seedRecord.js
  verifySeedRecord.js
  resolver.js
  safePublicBundle.js
  handlePassport.js

src/cli/
  seed.js
  resolve.js

src/forest/
  seedRegistry.js
  seedRoutes.js

docs/
  shellseed.md
  shellseed-protocol.md
  shellseed-security.md
  shellnames-cross-forest.md
```

If the repo structure is different, adapt safely.

---

# Tests

Add tests for:

```txt
valid seed record verifies
tampered seed record fails
seed record signed by wrong key fails
expired seed record rejected/warned
seeder refuses .postsnail
seeder refuses backup/private files
seeder blocks path traversal
seeder serves only public bundle files
resolver rejects mismatched fingerprint
resolver rejects invalid manifest signature
forest accepts valid seed record
forest rejects expired seed record
same handle blocked in same forest
same handle allowed in different forests
Handle Passport verifies
tampered Handle Passport fails
```

---

# Manual Test

1. Build/export a PostSnail public ZIP.
2. Run:

```bash
postsnail seed serve --bundle ./public-site.zip --port 8787
```

3. Visit:

```txt
http://127.0.0.1:8787/health
```

4. Fetch manifest from seeder.
5. Confirm bundle fingerprint matches.
6. Submit seed record to local Forest.
7. Resolve ShellName to bundle + seeder.
8. Download bundle from seeder.
9. Verify bundle locally.
10. Confirm `.postsnail` workspace is never served.

---

# Acceptance Criteria

Done when:

1. ShellSeed protocol docs exist.
2. Seed record format exists.
3. Local safe seeder CLI works.
4. Seeder serves only verified public bundle files.
5. Forest seed registry endpoints exist or are stubbed clearly.
6. Resolver can resolve ShellName/Shell ID to latest bundle + seeders.
7. Handle Passport format exists.
8. Username policy is documented.
9. Tests cover security and identity rules.
10. No private `.postsnail` data can be served.

---

# Future Roadmap

Later versions can add:

```txt
WebRTC browser seeding
DHT-style peer discovery
IPFS pinning helper
supporter dashboards
seed uptime stats
creator thank-you pages
bandwidth contribution reports
auto-update seeding daemon
mobile read-only resolver
Canopy seed dashboard
```

---

# Final Ecosystem Sentence

```txt
PostSnail creates the shell and trail.
ShellNames gives the trail a readable path.
Forest resolves the path.
ShellSeed lets supporters host the trail.
The shell stays private.
The bundle stays verifiable.
```
