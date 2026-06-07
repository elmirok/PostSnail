---
name: postsnail-spark
description: Use when fixing bugs in the PostSnail repo with Codex-Spark 5.3. This is a safe, compatibility-first workflow for admin, protocol, registry, workspace, and export surfaces.
---

# PostSnail Codex-Spark 5.3 Fix Workflow

This skill is for execution planning and safe fix work inside this repo. It is intentionally conservative: preserve protocol contracts, keep compatibility, and avoid broad refactors.

## When to use
Use this skill for scoped PostSnail fixes when you have a concrete issue and need to make the smallest safe change set. It applies to:

- Browser admin (`app.js`) behavior and tab flows.
- Core protocol/compatibility modules in `src` (workspace, verifier, exporter, crypto, manifest, plugin/theme systems).
- Forest tracker endpoints and verification logic in `registry/src`.
- Generated public pages/docs (`docs`, `scripts/generate-public-site.js`, static assets).

## Fixed fix playbook

1. State the failure precisely before editing.
2. Classify the issue in one bucket:
   - `ui` (admin usability or rendering),
   - `core` (protocol/workspace/crypto/verifier/exporter),
   - `registry` (search, submit, shellnames, crawl/verify),
   - `docs` (public docs/guides/branding/process).
3. Define the minimal acceptance behavior and map expected inputs/outputs.
4. Target only the smallest file set needed for that behavior.
5. Implement one behavior change per pass.
6. Preserve compatibility defaults and legacy paths unless explicitly told otherwise.
7. Add/adjust tests only around the changed behavior.
8. Summarize compatibility impact before finalizing.

## Non-negotiable constraints

- Never mutate the `.postsnail` envelope parsing format (`format`, `version`, and canonical header structure).
- Never add or expose raw private key material in UI text, generated docs, logs, or responses.
- Never alter public ZIP structure unless the task explicitly requests it.
- Never introduce backend-required logic into browser-only admin code paths.
- Never bypass existing compatibility gates (`CURRENT_WORKSPACE_VERSION`, `CURRENT_MANIFEST_VERSION`, protocol validation, required features).
- Never hide failure paths; keep signed-proof failure/error messages truthful.

## Required fix shape

- Start with a short root-cause summary.
- List exact touched modules and expected side-effects.
- Include `compatibility` section:
  - `.postsnail` compatibility impact,
  - `.well-known/postsnail.json` and `postsnail.manifest.json` compatibility,
  - whether any proof or fingerprint behavior changed.
- Provide one explicit verification plan.

## Response template

### Root cause
- one sentence about why it failed.

### Files touched
- explicit file list with change intent.

### Compatibility impact
- legacy support retained or changed;
- proof checks and signatures preserved/updated;
- migration behavior.

### Diff expectation
- what a reviewer should observe in outputs and behavior.

### Verification
- call out one targeted test path first (per area), then broader checks if needed.

### Follow-up risks
- list remaining edge cases and whether they need another pass.

## Area-specific defaults

### UI/admin fixes
- Default checks: `npm test`, `npm run build:admin`, `npm run deploy:dry-run`.
- Manual check: `/admin/` and Forest search pages for no horizontal overflow and no accidental locked-state regressions.

### Registry fixes
- Default checks: `cd registry && npm test`, `cd registry && npm run typecheck`, `cd registry && npm run deploy:dry-run`.

### Protocol/security fixes
- Add or update fixtures in:
  - `tests/verifier.test.js`
  - `tests/workspace.test.js`
  - relevant plugin/asset/public export tests.
- Preserve legacy path behavior unless explicitly asked to change it.

## Scope boundaries

- No new APIs, endpoints, schema fields, migrations, or architecture-wide refactors by default.
- Use minimal, reversible changes tied to the fix request.

## Cross-skill note
For design and copy-level guidance, continue to use `postsnail-branding`.
