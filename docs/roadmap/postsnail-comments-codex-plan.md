# PostSnail Comments — Codex Plan

## Purpose

PostSnail Comments is the first official PostSnail plugin/system layer for adding comments to static PostSnail blogs.

The goal is to keep the blog static and creator-owned while allowing signed dynamic discussion through trackers.

The recommended model is **hybrid comments**:

```txt
Approved static comments = official/permanent
Live tracker comments = dynamic/unapproved
```

The creator’s public site remains static. Trackers only hold signed public comment packets. The browser verifies every comment before showing it.

---

## Core Principle

```txt
The post is static.
The comment packet is signed.
The tracker is only delivery/discovery.
The creator decides what becomes official.
```

A tracker may show live comments, but only the creator’s signed static export can make a comment official.

---

## Codex Goal

Work in the PostSnail ecosystem.

Goal: implement PostSnail Comments as a hybrid signed comment system for static PostSnail blogs.

Do not ask questions. Make safe decisions, implement an MVP, test, and document.

---

## Architecture

PostSnail Comments has four parts:

```txt
1. Static comment runtime
   JS/CSS included in generated public ZIP.

2. Approved comments export
   Static JSON included in the ZIP.

3. Comment tracker
   Optional relay for live signed comments.

4. PostSnail Admin moderation
   Creator fetches, verifies, approves, rejects, and exports official comments.
```

---

## Important Decision

The generated public ZIP is not the editable source.

The `.postsnail` encrypted workspace is the editable source and must store:

- plugin settings
- tracker URLs
- approved comments
- rejected comments
- blocked author keys
- moderation state
- comment protocol version
- plugin state

The public ZIP should only contain:

- runtime JS/CSS
- approved public comments
- public comment metadata
- public proof files

---

## Static Export Structure

When comments are enabled, the generated website ZIP should include:

```txt
/postsnail-comments/comments.js
/postsnail-comments/comments.css
/postsnail-comments/approved-comments.json
/postsnail-comments/plugin-manifest.json
```

Each post page should include:

```html
<section id="postsnail-comments"></section>
<script type="module" src="/postsnail-comments/comments.js"></script>
```

Each post page should expose metadata:

```html
<meta name="postsnail:comments-enabled" content="true">
<meta name="postsnail:site-public-key" content="...">
<meta name="postsnail:post-slug" content="...">
<meta name="postsnail:post-digest" content="...">
<meta name="postsnail:bundle-fingerprint" content="...">
<meta name="postsnail:comment-trackers" content="https://comments.example">
```

---

## Comment Packet Format

Create a signed public comment format:

```json
{
  "protocol": "postsnail-comment-v1",
  "type": "postsnail_comment",
  "commentId": "psnc-sha3-512-...",
  "target": {
    "sitePublicKey": "base64:...",
    "postSlug": "post-slug",
    "postDigest": "sha3-512:...",
    "bundleFingerprint": "psn1-sha3-512-..."
  },
  "author": {
    "displayName": "",
    "handle": "",
    "siteUrl": "",
    "shellName": "",
    "publicKey": "base64:..."
  },
  "content": {
    "format": "markdown",
    "body": ""
  },
  "createdAt": "",
  "parentCommentId": "",
  "requiredFeatures": ["signed-comment"],
  "optionalFeatures": ["shellname", "threading"],
  "signatureSuite": "ML-DSA-65",
  "digestSuite": "SHA3-512",
  "signature": "base64:..."
}
```

The signature must sign canonical JSON without the `signature` field.

---

## Comment ID

Compute `commentId` deterministically from the canonical unsigned comment payload.

Example:

```txt
commentId = psnc-sha3-512-{digest}
```

---

## Target Hash

Trackers should index comments by target hash.

Example:

```txt
targetHash = sha3-512(sitePublicKey + postSlug + postDigest)
```

This lets trackers group comments by post without owning the blog.

---

## Runtime Behavior

`comments.js` should:

1. Read post metadata from meta tags.
2. Load `/postsnail-comments/approved-comments.json`.
3. Render approved comments as official comments.
4. Fetch live comments from configured trackers.
5. Verify every live comment signature in the browser.
6. Reject invalid comments.
7. Hide blocked keys if blocklist is exported publicly.
8. Sanitize markdown before rendering.
9. Render live comments separately as “Live signed replies.”
10. Fail gracefully if trackers are offline.

Display sections:

```txt
Approved comments
Live signed replies
```

Add a clear note:

```txt
Live signed replies are verified, but not yet approved by the creator.
```

---

## Approved Comments Format

Approved comments should be exported as static JSON:

```json
{
  "protocol": "postsnail-comments-static-v1",
  "generatedAt": "",
  "sitePublicKey": "base64:...",
  "comments": [
    {
      "comment": {},
      "approvedAt": "",
      "approvedBySitePublicKey": "base64:...",
      "approvalSignature": "base64:..."
    }
  ]
}
```

If signing approval records is too large for MVP, implement the format and document approval signatures as the next step. But prefer signing approvals if possible.

---

## Admin Features

Add a Comments panel in PostSnail Admin.

Features:

- enable/disable comments globally
- enable/disable comments per post if practical
- manage tracker URLs
- normalize/deduplicate HTTPS tracker URLs
- fetch pending comments from trackers
- verify comment signatures
- approve comments
- reject comments
- block author public keys
- store moderation state in `.postsnail` workspace
- export approved comments into public ZIP
- never include rejected/private moderation notes in public ZIP unless explicitly public

---

## Comment Author Identity

For MVP, a commenter must have a signing key.

Support:

```txt
1. Full PostSnail identity
2. Lightweight comment identity
3. Optional ShellName
4. Optional website URL
```

Minimum required:

- author public key
- signed comment

Optional:

- display name
- handle
- ShellName
- site URL
- avatar URL later

No account system.

---

## Comment Tracker MVP

Create a tracker module/service:

```txt
comments-tracker/
├── package.json
├── src/index.js
├── src/storage.js
├── src/verifyComment.js
├── src/protocol.js
└── README.md
```

Endpoints:

```txt
POST /comments
GET /comments?target=<targetHash>
GET /comments/:commentId
GET /recent-comments.json
GET /export/comments.json
GET /health
```

Tracker behavior:

- accept signed public comment packets
- validate shape
- verify signature
- compute comment ID
- compute target hash
- reject invalid signatures
- reject oversized comments
- reject duplicate comment IDs
- rate-limit if practical
- store compact JSON records
- serve comments by target hash
- expose export JSON
- require no accounts

---

## Spam and Abuse Controls

MVP controls:

- no unsigned comments
- max body length
- max links per comment
- blocklist by author public key
- blocklist by domain/site URL
- reject duplicate comment IDs
- tracker rate limit by IP if practical
- tracker rate limit by public key
- creator moderation approval

Future controls:

- proof-of-work for unknown authors
- allowlist mode
- ShellName reputation
- domain verification boost
- community moderation lists

---

## Security Rules

- Never trust tracker content.
- Verify all comments in browser before rendering.
- Sanitize markdown/HTML output.
- Never auto-open attachments.
- Keep comments public for MVP.
- Do not mix private MailSnail messaging into comment MVP.
- Unknown optional fields must be ignored.
- Unknown required features must fail safely.
- Trackers can hide comments, but cannot fake valid signatures.
- Creator approval turns a comment into official static content.

---

## PostSnail Workspace Integration

The `.postsnail` workspace should store plugin state:

```json
{
  "comments": {
    "enabled": true,
    "trackers": [],
    "approvedComments": [],
    "rejectedComments": [],
    "blockedPublicKeys": [],
    "settings": {
      "showLiveReplies": true,
      "requireApprovalForOfficial": true
    }
  }
}
```

Migration rules must preserve this state.

---

## Public ZIP Safety

The public ZIP must not include:

- rejected comments
- private moderation notes
- private plugin state
- raw private keys
- encrypted workspace
- drafts
- unpublished content

The public ZIP may include:

- comment runtime JS/CSS
- approved comments
- public blocklist if creator chooses
- public comment metadata

---

## Docs

Create/update:

```txt
docs/comments.md
docs/comment-protocol.md
docs/comment-tracker.md
docs/comment-moderation.md
docs/security.md
docs/plugin-system.md
docs/workspace-vault.md
README.md
```

Docs must explain:

- why comments are hybrid
- where comments live
- how static blogs show dynamic comments
- approved static comments vs live tracker comments
- what a signed comment proves
- what it does not prove
- how creator moderation works
- how comments are stored in `.postsnail`
- what is exported to public ZIP
- tracker limitations and trust model

---

## Tests

Add tests for:

- canonical comment JSON
- comment ID generation
- valid signature verifies
- invalid signature fails
- tampered comment fails
- target hash generation
- approved comments export shape
- runtime separates approved and live comments
- runtime rejects invalid live comments
- tracker accepts valid comment
- tracker rejects invalid comment
- tracker rejects duplicate comment ID
- blocked public key hidden
- tracker URL normalization
- `.postsnail` workspace preserves comment state
- public ZIP excludes rejected/private moderation state
- legacy workspace without comments still works

---

## Manual Test

1. Create a PostSnail workspace.
2. Enable comments.
3. Add tracker URL.
4. Create a post.
5. Export public ZIP.
6. Confirm post page includes comments container and runtime.
7. Start comment tracker locally.
8. Submit a signed comment.
9. Open exported post page.
10. Confirm live signed reply appears.
11. Approve comment in Admin.
12. Export again.
13. Confirm approved comment appears from static JSON.
14. Confirm rejected comments are not public.

---

## Acceptance Criteria

Done when:

1. PostSnail can export static sites with comments runtime.
2. Approved comments appear from static JSON.
3. Live comments load from tracker.
4. Every live comment is verified before rendering.
5. Invalid comments are rejected.
6. Creator can approve/reject/block comments.
7. Comment state is stored in `.postsnail` workspace.
8. Public ZIP excludes private moderation state.
9. Comment tracker MVP works.
10. Docs explain architecture and trust model.
11. Tests cover protocol, tracker, runtime, and workspace state.

---

## Future Ideas

Later versions can add:

- threaded replies
- creator approval signatures
- WebRTC direct delivery
- encrypted private replies
- PostSnail Inbox
- ShellName reputation
- proof-of-work anti-spam
- comment federation between trackers
- static comment SEO rendering
- comment import/export packs
- reader app integration

---

## Final Product Sentence

PostSnail Comments lets static blogs have dynamic discussion without giving up ownership.

```txt
The post is static.
The comment is signed.
The tracker delivers.
The creator approves.
The next export makes it official.
```
