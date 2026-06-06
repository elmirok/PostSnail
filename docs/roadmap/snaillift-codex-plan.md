# SnailLift — Codex Plan

## Product Summary

**SnailLift** is the PostSnail deployment assistant.

It is **not** a hosting company. It helps PostSnail creators publish their signed static trails to hosting providers they control, starting with Cloudflare Pages and GitHub Pages.

Product sentence:

> Your shell stays private. Your trail goes live.

---

## Core Philosophy

```txt
PostSnail Admin = create and sign
.postsnail workspace = private shell
SnailLift = deployment assistant
Cloudflare / GitHub Pages = actual hosting
Forest = discovery
```

SnailLift should never own the creator’s source, identity, or hosting account.

It should only make deployment easier.

---

## Goal for Codex

Work in the PostSnail ecosystem.

Build **SnailLift**, a PostSnail-native deployment assistant that can help creators deploy their generated public static website to Cloudflare Pages and GitHub Pages with minimal friction.

Do not ask questions. Make safe technical decisions, implement an MVP, test, and document.

---

## Non-Negotiable Rules

- `.postsnail` workspace is private and must never be uploaded.
- Only public generated static files may be deployed.
- Private keys must never be uploaded.
- Drafts must never be uploaded.
- Rejected comments and private moderation state must never be uploaded.
- Download ZIP remains the universal fallback.
- SnailLift must verify before deploy and verify again after deploy.
- SnailLift should notify the Forest tracker only after live verification succeeds.
- SnailLift should be optional, not required for PostSnail publishing.

---

## Name and Branding

### Name

```txt
SnailLift
```

### Taglines

```txt
Your shell stays private. Your trail goes live.
Deploy your PostSnail trail without giving up your shell.
One-click publishing for signed static PostSnail blogs.
```

### Product Role

SnailLift is the ladder, not the tree.

It helps a signed PostSnail site climb onto the public web through a creator-controlled hosting provider.

---

## MVP Scope

### Required MVP

1. Deployment assistant UI.
2. Public export safety check.
3. Cloudflare Pages deploy support.
4. GitHub Pages deploy support or GitHub repository push support.
5. Live deployment verification.
6. Forest tracker announce after verification.
7. ZIP download fallback.
8. Deployment logs.
9. Documentation.

### Do Not Build Yet

```txt
Generic hosting
Treetop-style file hosting
Teams
Billing
OAuth marketplace
Analytics
Complex DNS automation
Server-side storage of user projects
WebRTC
Comments integration
MailSnail integration
```

---

## Architecture

```txt
PostSnail Exporter
   ↓
Public files + zipBytes + manifest + bundleFingerprint
   ↓
SnailLift safety check
   ↓
Deployment provider
   ↓
Cloudflare Pages / GitHub Pages
   ↓
Live verifier
   ↓
Forest announce
   ↓
Deployment log
```

---

## 1. Export Pipeline Refactor

Refactor the PostSnail exporter so it returns a deployable bundle:

```js
{
  files: {
    "index.html": Uint8Array,
    "feed.json": Uint8Array,
    "rss.xml": Uint8Array,
    "sitemap.xml": Uint8Array,
    "postsnail.manifest.json": Uint8Array,
    ".well-known/postsnail.json": Uint8Array
  },
  zipBytes,
  manifest,
  bundleFingerprint
}
```

Keep ZIP download unchanged.

The same export should support:

```txt
Download ZIP
Deploy with SnailLift
Agent/CLI deployment
Future providers
```

---

## 2. SnailLift Provider Interface

Create:

```txt
src/snaillift/
  index.js
  providers.js
  safety.js
  liveVerifier.js
  deploymentLog.js
  providers/
    cloudflarePages.js
    githubPages.js
```

Provider interface:

```js
export const provider = {
  id: "cloudflare-pages",
  name: "Cloudflare Pages",
  async deploy({ files, manifest, settings, secrets, onProgress }) {}
};
```

Future providers should be easy to add:

```txt
Netlify
Vercel
IPFS
SFTP
R2 + Worker
Creator-owned Deploy Worker
```

---

## 3. Safety Check

Create `src/snaillift/safety.js`.

Before any deploy, scan generated files and block:

```txt
.postsnail
workspace
backup
private-key
secretKey
rawPrivateKey
encrypted-workspace
drafts/
rejected-comments
private-plugin-state
.env
```

Also block unsafe paths:

```txt
../
absolute paths
hidden admin files
server scripts unless explicitly allowed
```

Allowed file categories:

```txt
html
css
js
json
xml
txt
md
png
jpg
jpeg
webp
ico
woff
woff2
```

SVG should be sanitized or warned because SVG can contain script-like behavior.

Deployment must fail if unsafe data is found.

---

## 4. Cloudflare Pages Provider

Implement Cloudflare Pages deployment.

Cloudflare Pages supports direct uploads of prebuilt static assets, and Wrangler can deploy a directory with:

```bash
CLOUDFLARE_ACCOUNT_ID=<ACCOUNT_ID> npx wrangler pages deploy <DIRECTORY> --project-name=<PROJECT_NAME>
```

SnailLift should support at least one Cloudflare path:

### Option A — Browser/API direct mode

Settings:

```txt
accountId
projectName
branch
siteUrl
apiToken
rememberToken=false
```

Rules:

- Ask for API token at deploy time.
- Do not store token by default.
- If storing is enabled, store only inside encrypted `.postsnail` workspace.
- Show warning: use a limited Cloudflare Pages token.

Flow:

```txt
generate files
run safety check
build upload request
deploy to Cloudflare Pages
return deployment URL
verify live manifest
notify forest
```

If browser CORS blocks Cloudflare API use, show a clear error and recommend Wrangler/CLI or Deploy Worker mode.

### Option B — CLI mode for agents

For PostSnail CLI / Aurel / server-side automation:

```bash
postsnail snaillift deploy cloudflare   --workspace aurel.postsnail   --out public-build   --account "$CLOUDFLARE_ACCOUNT_ID"   --project "$CLOUDFLARE_PROJECT_NAME"   --token "$CLOUDFLARE_API_TOKEN"
```

This mode can shell out to Wrangler or use Cloudflare API directly.

---

## 5. GitHub Pages Provider

Implement GitHub Pages deployment support.

MVP options:

### Option A — Commit generated files to a repository branch

Settings:

```txt
owner
repo
branch
targetDir
token
siteUrl
```

Flow:

```txt
generate files
run safety check
commit files to repo
GitHub Pages serves branch/folder
verify live manifest
notify forest
```

Use GitHub repository contents API or git-based commit flow.

### Option B — GitHub Actions workflow dispatch

Optional future mode:

```txt
SnailLift pushes artifact/branch
GitHub Actions deploys Pages
```

MVP should prefer the simpler repo file update/commit path.

Token rules:

- Use limited GitHub token.
- Do not store by default.
- Store only encrypted in `.postsnail` workspace if user explicitly enables it.

---

## 6. UI

Add a **SnailLift / Deploy** panel.

Sections:

```txt
Download ZIP
Deploy to Cloudflare Pages
Deploy to GitHub Pages
Verify Live Site
Notify Forest
Deployment Logs
```

Cloudflare form:

```txt
Account ID
Project name
Branch
Site URL
API token
Save token encrypted in workspace? default no
Notify Forest after deploy? default yes
```

GitHub form:

```txt
Owner
Repository
Branch
Target folder
Site URL
GitHub token
Save token encrypted in workspace? default no
Notify Forest after deploy? default yes
```

Warning:

```txt
SnailLift deploys only your public generated site.
Your .postsnail workspace, drafts, private keys, and private plugin state are not uploaded.
```

---

## 7. Live Verification

Create `src/snaillift/liveVerifier.js`.

After deployment, fetch:

```txt
/postsnail.manifest.json
/.well-known/postsnail.json
/feed.json
/sitemap.xml
```

Verify:

```txt
manifest exists
bundle fingerprint matches generated export
public key matches
well-known points to manifest/fingerprint
optional latest commit matches
feeds exist
sitemap exists if generated
```

If live verification fails:

```txt
Deployment uploaded but not verified.
Do not notify Forest.
Show error and expected vs actual fingerprint.
```

---

## 8. Forest Announce

After live verification succeeds, call existing Forest announce/notify flow.

Payload:

```json
{
  "siteUrl": "",
  "manifestUrl": "",
  "wellKnownUrl": "",
  "publicKey": "",
  "bundleFingerprint": "",
  "generatedAt": "",
  "provider": "cloudflare-pages"
}
```

Do not announce before verification.

---

## 9. Deployment Logs

Add local deployment logs in `.postsnail` workspace.

Store:

```json
{
  "provider": "cloudflare-pages",
  "siteUrl": "",
  "deploymentUrl": "",
  "bundleFingerprint": "",
  "startedAt": "",
  "finishedAt": "",
  "status": "success",
  "forestAnnounced": true
}
```

Do not store raw API tokens in logs.

---

## 10. SnailLift CLI Support

Add CLI commands if PostSnail CLI exists or is planned:

```bash
postsnail snaillift providers
postsnail snaillift deploy cloudflare
postsnail snaillift deploy github
postsnail snaillift verify-live
postsnail snaillift announce-forest
```

This is important for Aurel Shellscribe full-auto mode.

---

## 11. Creator-Owned Deploy Worker Future Path

Document but do not fully implement unless easy.

Future architecture:

```txt
Browser Admin
   ↓
Creator-owned Deploy Worker
   ↓
Cloudflare Pages API
```

Why:

```txt
Browser never sees long-lived token
Worker stores token as secret
Worker deploys only one configured project
Worker can verify PostSnail manifest before publishing
```

Create:

```txt
docs/snaillift-deploy-worker.md
```

---

## 12. Documentation

Create/update:

```txt
docs/snaillift.md
docs/snaillift-cloudflare.md
docs/snaillift-github-pages.md
docs/snaillift-security.md
docs/publishing.md
docs/workspace-vault.md
README.md
```

Docs must explain:

```txt
SnailLift is not hosting.
SnailLift is a deployment assistant.
The .postsnail file is private.
The generated ZIP/static files are public.
Download ZIP is always available.
Cloudflare/GitHub tokens must be limited.
Tokens are not stored unless explicitly saved encrypted.
Live verification happens after deploy.
Forest notify happens only after live verification.
```

---

## 13. Tests

Add tests for:

```txt
export returns files + zipBytes
safety check blocks .postsnail
safety check blocks raw private key strings
safety check blocks drafts
Cloudflare provider validates missing settings
Cloudflare provider builds expected request/command
GitHub provider validates missing settings
GitHub provider builds expected commit/update payload
live verifier passes matching manifest
live verifier fails mismatched fingerprint
forest notify happens only after live verification
deployment log excludes secrets
ZIP download still works
```

Mock network requests. Do not require real Cloudflare or GitHub credentials in tests.

---

## 14. Manual Test Plan

Test Cloudflare:

```txt
1. Create PostSnail workspace.
2. Create post.
3. Generate public export.
4. Run safety check.
5. Deploy to Cloudflare Pages.
6. Fetch live manifest.
7. Confirm fingerprint match.
8. Confirm Forest announce happened.
9. Confirm .postsnail workspace was not uploaded.
```

Test GitHub:

```txt
1. Create GitHub Pages repo.
2. Deploy generated files.
3. Confirm repo contains public static files only.
4. Confirm GitHub Pages site loads.
5. Verify live manifest.
6. Announce Forest.
```

---

## 15. Acceptance Criteria

Done when:

1. SnailLift panel exists.
2. ZIP download still works.
3. Public export bundle can be reused for deployment.
4. Safety scan blocks private workspace data.
5. Cloudflare Pages deploy works or fails clearly if CORS/API blocks browser mode.
6. GitHub Pages provider exists.
7. Live verification checks deployed manifest.
8. Forest announce only runs after live verification.
9. Deployment logs are saved without secrets.
10. Docs explain SnailLift clearly.
11. Tests pass or manual verification is documented.

---

## Strategic Note

SnailLift should stay narrow.

It is not:

```txt
a hosting company
a file storage service
a CDN
a social platform
a DNS provider
```

It is:

```txt
a PostSnail-native deployment assistant
```

Final ecosystem sentence:

```txt
PostSnail creates the shell and trail.
SnailLift publishes the trail.
Forest helps people find it.
ShellNames gives it a readable path.
```
