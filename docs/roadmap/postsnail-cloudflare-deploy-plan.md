# PostSnail Cloudflare Deploy Sprint Plan

**Repository:** `elmirok/PostSnail`  
**Sprint:** Cloudflare Pages publishing from browser admin  
**Purpose:** Archive of the Codex implementation plan for adding optional Cloudflare deployment to PostSnail.

---

## Goal

Add Cloudflare Pages publishing so the creator can deploy the generated public static site directly from PostSnail Admin, then verify the live deployment and notify the forest tracker.

Do not ask questions. Implement the safest working MVP, test, and document.

---

## Core Rule

- `.postsnail` workspace stays private and is never uploaded.
- Public website ZIP/static files are the only deployable output.
- Private keys, drafts, rejected comments, private plugin state, and workspace data must never be sent to Cloudflare.
- Download ZIP must remain available forever as fallback.
- App must still run with:

```bash
python3 -m http.server 4173
```

---

## 1. Refactor Export Pipeline

Refactor exporter so one build can produce:

```js
{
  files: {
    "index.html": Uint8Array,
    "feed.json": Uint8Array,
    "rss.xml": Uint8Array,
    "postsnail.manifest.json": Uint8Array
  },
  zipBytes,
  manifest,
  bundleFingerprint
}
```

Keep existing ZIP download working.

Add a reusable public export validator that confirms no private workspace data appears in `files`.

---

## 2. Add Deploy Provider Interface

Create:

```txt
src/deploy/
  providers.js
  cloudflarePages.js
  liveVerifier.js
```

Provider shape:

```js
export const provider = {
  id: "cloudflare-pages",
  name: "Cloudflare Pages",
  async deploy({ files, manifest, settings, token, onProgress }) {}
};
```

Design so future providers can be added:

- GitHub Pages
- Netlify
- Vercel
- IPFS
- SFTP
- creator-owned Deploy Worker

---

## 3. Cloudflare Pages MVP

Implement Cloudflare Pages direct deploy.

### Settings

- accountId
- projectName
- branch, default `main`
- productionDomain or siteUrl
- rememberToken: false by default

### Token Handling

- Ask user for Cloudflare API token at deploy time.
- Do not store token by default.
- If user explicitly chooses to save it, store only inside encrypted `.postsnail` workspace.
- Warn that token should be limited to Cloudflare Pages Write for the chosen account/project.

### Deployment Flow

1. Generate public site files.
2. Verify generated files locally.
3. Build Cloudflare direct-upload manifest mapping file paths to content hashes.
4. Send multipart form-data to Cloudflare Pages deployment API.
5. Show progress/status.
6. Return deployment URL/result.
7. Fetch live `postsnail.manifest.json`.
8. Verify live manifest fingerprint matches local export.
9. If verified, optionally notify forest tracker.
10. Show final success with live URL and fingerprint.

If browser CORS blocks direct Cloudflare API calls, detect it and show a clear error. Then document fallback paths:

- Download ZIP
- Use Wrangler CLI manually
- Future creator-owned Deploy Worker

---

## 4. UI

Add a `Publish` or `Deploy` panel.

### Buttons

- `Download Website ZIP`
- `Deploy to Cloudflare Pages`
- `Notify Forest Tracker`

### Cloudflare Form Fields

- Account ID
- Pages project name
- Branch
- Site URL
- API token
- checkbox: save token encrypted in workspace
- checkbox: notify forest after successful deploy

### Warning Text

> This deploys only your public generated website. Your encrypted `.postsnail` workspace, drafts, private keys, and private plugin state are not uploaded.

---

## 5. Live Verification

Implement:

```js
verifyLiveDeployment(siteUrl, expectedManifest)
```

It should fetch:

- `/postsnail.manifest.json`
- `/.well-known/postsnail.json`
- `/feed.json`
- `/sitemap.xml` if present

Then verify:

- live manifest exists
- live bundle fingerprint equals generated bundle fingerprint
- live public key equals generated public key
- `.well-known` points to same manifest/fingerprint
- optional: latest commit matches

If verification fails, show deploy as:

```txt
uploaded but not verified
```

---

## 6. Forest Tracker Notification

After live verification succeeds, call the existing tracker notify/announce flow.

Payload should include:

- siteUrl
- manifestUrl
- wellKnownUrl
- publicKey
- bundleFingerprint
- generatedAt
- signature if current protocol supports it

Do not notify tracker before live verification succeeds.

---

## 7. Creator-Owned Deploy Worker Docs

Do not fully implement unless easy, but document the safer future path:

```txt
Browser Admin → creator-owned Deploy Worker → Cloudflare Pages API
```

Explain why:

- Browser never sees long-lived Cloudflare API token.
- Worker stores token as secret.
- Worker can deploy only one configured Pages project.
- Worker can verify PostSnail manifest before deploying.

Create:

```txt
docs/deploy-worker.md
```

with architecture and future implementation notes.

---

## 8. Security

Add checks to prevent deploying:

- `.postsnail` workspace files
- backup JSON
- encrypted workspace payloads
- raw private keys
- drafts
- rejected comments
- private plugin state

Create:

```txt
src/deploy/safety.js
```

with a blocklist and tests.

---

## 9. Docs

Create/update:

```txt
docs/cloudflare-deploy.md
docs/publishing.md
docs/security.md
docs/workspace-vault.md
README.md
```

Docs must explain:

- Download ZIP is the universal fallback.
- Cloudflare deploy is optional.
- `.postsnail` is private source.
- public ZIP/files are publishable output.
- how to create a limited Cloudflare API token.
- how to find Cloudflare account ID and Pages project name.
- what is uploaded and what is never uploaded.
- live verification after deploy.
- tracker notify after deploy.

---

## 10. Tests

Add tests for:

- export returns `files` and `zipBytes`
- deploy manifest maps all public files
- private file safety blocklist works
- `.postsnail` workspace is never included
- Cloudflare provider builds correct request shape
- missing account/project/token fails clearly
- live verifier passes matching manifest
- live verifier fails mismatched fingerprint
- tracker notify is called only after live verification
- ZIP download still works

Mock network requests. Do not require real Cloudflare credentials for tests.

---

## 11. Acceptance Criteria

Done when:

1. User can still download the website ZIP.
2. User can deploy generated public files to Cloudflare Pages using account ID, project name, and API token.
3. Token is not stored unless explicitly selected.
4. Public export safety checks run before deploy.
5. Live deployed manifest is verified after deploy.
6. Forest tracker is notified only after verified deploy.
7. Private workspace data is never uploaded.
8. Errors are clear and non-destructive.
9. Docs explain Cloudflare deploy and fallback.
10. Tests pass or manual test steps are documented.

---

## Final Codex Summary Requirement

Finish with a summary containing:

- files changed
- features implemented
- tests run
- limitations
- manual verification steps

