# PostSnail CLI / Headless Publisher — Codex Plan

## Purpose

Build a PostSnail command-line interface so agents like **Aurel Shellscribe** can create, import, build, verify, deploy, and announce PostSnail blogs without needing to use the browser UI manually.

The browser admin remains the main human interface. The CLI becomes the automation interface.

```txt
PostSnail Admin = human UI
PostSnail Core = shared engine
PostSnail CLI = automation interface
Hermes/Codex agents = automated writers/publishers
```

---

## Core Rule

The CLI must use the same PostSnail rules as the browser app:

- `.postsnail` workspace is the private encrypted editable source.
- Website ZIP/static files are public publishing output.
- Private keys, drafts, rejected comments, private plugin state, and workspace secrets must never be deployed.
- All generated sites must be signed and verifiable.
- Existing browser workflow must keep working.

---

## Codex Goal

Work in `elmirok/PostSnail`.

Goal: create a Node-based PostSnail CLI and shared publishing core so a Hermes agent can publish a PostSnail blog with minimal human intervention.

Do not ask questions. Make safe implementation decisions, implement, test, and document.

---

## 1. Refactor Shared Core

Move reusable logic out of browser-only UI code into shared modules that can run in both browser and Node.

Suggested structure:

```txt
src/core/
  workspaceCore.js
  postImporter.js
  siteBuilder.js
  verifierCore.js
  manifestCore.js
  deployCore.js
  forestAnnounce.js
  cryptoCore.js
```

The browser admin and CLI should both call the same core logic where practical.

Avoid duplicating export, verification, manifest, and workspace code.

---

## 2. Add CLI Entry Point

Create:

```txt
bin/postsnail.js
```

Update `package.json`:

```json
{
  "bin": {
    "postsnail": "./bin/postsnail.js"
  }
}
```

Use a lightweight CLI parser or simple built-in argument parsing if dependencies should stay minimal.

The CLI should support:

```bash
postsnail --help
postsnail workspace info --workspace ./aurel.postsnail
postsnail post import ./drafts/my-post.md --workspace ./aurel.postsnail
postsnail build --workspace ./aurel.postsnail --out ./public
postsnail verify ./public
postsnail zip --workspace ./aurel.postsnail --out ./site.zip
postsnail deploy cloudflare --workspace ./aurel.postsnail
postsnail forest announce --workspace ./aurel.postsnail
postsnail publish --workspace ./aurel.postsnail --draft ./drafts/my-post.md
```

---

## 3. Workspace Handling

The CLI must open encrypted `.postsnail` workspaces.

Support passphrase through:

```txt
--passphrase
POSTSNAIL_WORKSPACE_PASSPHRASE
interactive prompt if possible
```

Rules:

- Never print passphrase.
- Never log private keys.
- Fail safely on wrong passphrase.
- Preserve workspace version/migration rules.
- Save workspace after changes only when requested or after successful import.

Useful commands:

```bash
postsnail workspace info --workspace ./blog.postsnail
postsnail workspace export-json --workspace ./blog.postsnail --out ./debug.json --unsafe
postsnail workspace migrate --workspace ./blog.postsnail --out ./blog-migrated.postsnail
```

The `export-json --unsafe` command must require an explicit flag and print warnings.

---

## 4. Markdown Draft Import

Aurel should write Markdown drafts with frontmatter.

Example:

```md
---
title: "Why the Forest Is Not the Home"
slug: "forest-is-not-the-home"
excerpt: "The shell is the home. The forest is discovery."
tags:
  - postsnail
  - forest
  - open-web
image: "images/forest-shell.png"
alt: "A glowing shell moving through a magical forest"
sources:
  - "https://example.com/source"
status: "ready"
---

Post content here.
```

Implement:

```bash
postsnail post import draft.md --workspace ./blog.postsnail
```

The importer should:

- parse frontmatter
- validate required fields
- copy/add referenced image if available
- preserve sources
- create or update post by slug
- default status to draft unless `status: ready`
- save imported post into workspace

---

## 5. Build Command

Implement:

```bash
postsnail build --workspace ./blog.postsnail --out ./public
```

It should:

1. Open workspace.
2. Build public static site files.
3. Include manifest, identity doc, sitemap, feeds, commit files, plugin runtime, and approved public comments if enabled.
4. Run public export safety checks.
5. Write files to output directory.
6. Print bundle fingerprint.

The build output must never include:

- `.postsnail` workspace
- drafts
- raw private keys
- rejected comments
- private moderation state
- private plugin state
- Cloudflare token

---

## 6. Verify Command

Implement:

```bash
postsnail verify ./public
postsnail verify ./site.zip
```

It should verify:

- manifest exists
- identity doc exists
- file hashes
- signatures
- bundle fingerprint
- latest commit if present
- legacy warnings if needed
- compatibility required/optional features

Exit codes:

```txt
0 = verified
1 = verification failed
2 = warning-only / legacy warning if desired, or keep warnings with exit 0
```

Document exact behavior.

---

## 7. ZIP Command

Implement:

```bash
postsnail zip --workspace ./blog.postsnail --out ./site.zip
```

It should use the same public build output and create a ZIP identical in structure to browser export.

---

## 8. Cloudflare Deploy Command

Implement:

```bash
postsnail deploy cloudflare --workspace ./blog.postsnail
```

Use environment variables:

```env
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_PROJECT_NAME=
CLOUDFLARE_API_TOKEN=
POSTSNAIL_SITE_URL=
```

Flow:

1. Build public site.
2. Verify local build.
3. Deploy to Cloudflare Pages using existing provider logic.
4. Fetch live manifest.
5. Verify live manifest fingerprint.
6. Print live URL.

Never deploy if local verification fails.

Never upload `.postsnail` workspace.

---

## 9. Forest Announce Command

Implement:

```bash
postsnail forest announce --workspace ./blog.postsnail
```

Use:

```env
FOREST_TRACKER_URL=https://forest.postsnail.org
POSTSNAIL_SITE_URL=
```

It should:

- read manifest/public identity from latest build or workspace
- create signed announce payload if supported
- call forest tracker announce endpoint
- print tracker response

Do not announce if site URL or manifest is missing.

---

## 10. One-Shot Publish Command

Implement:

```bash
postsnail publish \
  --workspace ./aurel.postsnail \
  --draft ./drafts/my-post.md \
  --deploy cloudflare \
  --announce forest
```

Flow:

1. Import Markdown draft.
2. Save workspace.
3. Build public site.
4. Verify public site.
5. Deploy to Cloudflare if requested.
6. Verify live site.
7. Announce to forest if requested.
8. Save publish log.

Create logs:

```txt
logs/publish-YYYY-MM-DD-HHMMSS.md
```

Log should include:

- draft path
- post slug
- bundle fingerprint
- deploy result
- forest announce result
- warnings
- errors

---

## 11. Aurel Automation Script

Create example script:

```txt
scripts/aurel-publish.sh
```

Example:

```bash
#!/usr/bin/env bash
set -euo pipefail

postsnail publish \
  --workspace "$POSTSNAIL_WORKSPACE" \
  --draft "$1" \
  --deploy cloudflare \
  --announce forest
```

Document required environment variables:

```env
POSTSNAIL_WORKSPACE=/home/boaz/aurel/aurel.postsnail
POSTSNAIL_WORKSPACE_PASSPHRASE=
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_PROJECT_NAME=
CLOUDFLARE_API_TOKEN=
POSTSNAIL_SITE_URL=
FOREST_TRACKER_URL=https://forest.postsnail.org
```

---

## 12. Security Requirements

Add CLI safety rules:

- Never print private keys.
- Never print passphrase.
- Mask tokens in logs.
- Do not save Cloudflare token to workspace from CLI unless explicitly requested later.
- Do not deploy if safety scan fails.
- Do not deploy draft-only content unless marked ready or explicit flag is passed.
- Every command that writes must print what it changed.

Add `--dry-run` where practical:

```bash
postsnail publish --dry-run ...
```

---

## 13. Tests

Add tests for:

- CLI help output
- workspace open wrong passphrase fails
- Markdown frontmatter import
- duplicate slug update behavior
- build creates required files
- build excludes private data
- verify passes valid build
- verify fails tampered build
- zip command creates valid ZIP
- deploy command builds correct request with mocked Cloudflare
- deploy never runs when verify fails
- forest announce mocked success
- publish command full mocked flow
- tokens are masked in logs
- publish log is created

Mock network calls. Do not require real Cloudflare credentials.

---

## 14. Documentation

Create/update:

```txt
docs/cli.md
docs/headless-publishing.md
docs/aurel-agent-publishing.md
docs/cloudflare-deploy.md
docs/security.md
README.md
```

Docs must explain:

- why CLI exists
- browser admin vs CLI
- `.postsnail` workspace as private source
- Markdown frontmatter format
- build/verify/zip/deploy/announce commands
- environment variables
- safe Aurel setup
- manual test steps
- limitations

---

## 15. Manual Test

Run:

```bash
npm install
npm test
node bin/postsnail.js --help
node bin/postsnail.js workspace info --workspace ./test-fixtures/aurel.postsnail
node bin/postsnail.js post import ./drafts/test.md --workspace ./test-fixtures/aurel.postsnail
node bin/postsnail.js build --workspace ./test-fixtures/aurel.postsnail --out ./public
node bin/postsnail.js verify ./public
node bin/postsnail.js zip --workspace ./test-fixtures/aurel.postsnail --out ./site.zip
```

For real deployment, test only after adding Cloudflare env vars.

---

## Acceptance Criteria

Done when:

1. `postsnail --help` works.
2. CLI can open encrypted `.postsnail` workspace.
3. CLI can import Markdown draft into workspace.
4. CLI can build public static site.
5. CLI can verify output.
6. CLI can create website ZIP.
7. CLI can deploy to Cloudflare with env vars.
8. CLI can announce to forest.
9. One-shot publish command exists.
10. Private workspace data is never included in build/deploy.
11. Tests cover core flows.
12. Docs explain how Aurel can publish with minimal human work.

---

## Final Product Sentence

The PostSnail CLI lets trusted agents publish without taking ownership away from the creator.

```txt
Aurel writes.
PostSnail signs.
Cloudflare hosts.
The forest discovers.
The creator owns the shell.
```
