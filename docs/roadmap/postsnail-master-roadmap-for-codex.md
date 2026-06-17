# PostSnail Ecosystem Master Roadmap for Codex

## Purpose

This roadmap orders the PostSnail ecosystem plans by priority and links each sprint to its detailed Markdown plan.

Use this file as the **Codex intake roadmap**. Codex should read this file first, then open the referenced plan file for the current sprint.

## Current Assumptions

```txt
DONE: encrypted .postsnail workspace
DONE: forest tracker
DONE: compatibility / migrations / PSEP baseline
NEXT: core foundation, then deployment, identity, plugins, and community features
```

## Ecosystem Principle

```txt
PostSnail creates the shell and trail.
SnailLift publishes the trail.
Forest helps people find it.
ShellNames gives it a readable path.
Plugins and themes extend it without bloat.
Comments bring conversation.
Canopy helps creators manage it all.
ShellSeed lets supporters host the trail.
```

## Permanent Architecture Rules

1. `.postsnail` is the private encrypted editable shell.
2. Public ZIP/static export is the signed public trail.
3. Forest is discovery, not ownership.
4. Shell ID is the real identity.
5. ShellName is a readable alias, not legal identity.
6. Download ZIP must remain available as a fallback.
7. Plugins must not load everywhere by default.
8. Public assets must load only on routes that declare them.
9. Old valid workspaces and exports should keep working.
10. Unknown optional fields/extensions should be ignored safely.
11. Unknown required features should fail clearly.

---

# Sprint Order

## 0. PostSnail Core Foundation

**Priority:** Critical  
**Plan:** [postsnail-core-foundation-plan.md](postsnail-core-foundation-plan.md)

### Why first
PostSnail needs a small trusted core boundary before deeper deployment, identity, plugin, theme, page, and community features grow around it.

### Main outcome
PostSnail Core owns the stable source/export/proof boundaries, plugin and theme manifest foundations, route-level asset declarations, and public export safety checks.

---

## 1. Compatibility / Migrations / PSEP Rules

**Priority:** Critical  
**Plan:** [compatibility-migrations-psep-codex-plan.md](compatibility-migrations-psep-codex-plan.md)

### Why first
Every later feature depends on PostSnail being able to evolve without breaking old `.postsnail` workspaces, public ZIP exports, manifests, plugins, and themes.

### Main outcome
PostSnail becomes a protocol with stable compatibility rules.

---

## 2. SnailLift Deploy

**Priority:** Critical  
**Plan:** [snaillift-codex-plan.md](snaillift-codex-plan.md)

### Why second
Creators need an easy path from signed static export to live website.

### Main outcome
One workflow:

```txt
Generate → Verify → Deploy → Verify Live → Announce to Forest
```

---

## 3. ShellNames

**Priority:** Critical  
**Plan:** [shellnames-codex-plan.md](shellnames-codex-plan.md)

### Why third
Creators without DNS still need readable discovery.

### Main outcome
Forest-scoped signed aliases like:

```txt
@elmirok@forest.postsnail.org
```

---

## 4. Plugin System Core + Theme System Spec

**Priority:** Very High  
**Plan:** [postsnail-plugin-theme-system-plan.md](postsnail-plugin-theme-system-plan.md)

### Why now
Before Pages, Comments, Search, Themes, and other extensions grow, the core needs safe extension rules.

### Main outcome
PostSnail becomes flexible like WordPress but avoids WordPress-style plugin bloat.

Key rule:

```txt
Install does not mean load.
Enable does not mean load everywhere.
Public assets load only where needed.
```

---

## 5. PostSnail Pages / CMS Plugin

**Priority:** High  
**Plan:** [postsnail-pages-cms-plugin-plan-v2.md](postsnail-pages-cms-plugin-plan-v2.md)

### Why
This powers `postsnail.org` and bigger sites without bloating the core.

### Main outcome
`.postsnail` becomes a portable encrypted CMS vault for pages, docs, tutorials, roadmap, changelog, and landing pages.

---

## 6. PostSnail Comments

**Priority:** High  
**Plan:** [postsnail-comments-codex-plan.md](postsnail-comments-codex-plan.md)

### Why
Comments make static blogs feel alive while keeping creator control.

### Main outcome
Hybrid comments:

```txt
Approved static comments = official/permanent
Live tracker comments = dynamic/unapproved
```

---

## 7. PostSnail CLI / Headless Publisher

**Priority:** High  
**Plan:** [postsnail-cli-headless-publisher-plan.md](postsnail-cli-headless-publisher-plan.md)

### Why
The CLI is the bridge to automation, agents, CI, and Aurel Shellscribe.

### Main outcome
Agents and scripts can import posts, build, verify, deploy, and announce.

---

## 8. Aurel Shellscribe Full-Auto Workflow

**Priority:** Medium-High  
**Plan:** [aurel-shellscribe-full-auto-workflow-plan.md](aurel-shellscribe-full-auto-workflow-plan.md)

### Why
Aurel grows the community through tutorials, reports, source-backed posts, images, and SEO review.

### Main outcome
Aurel can run in full-auto prepared mode, with PAUSE safety controls.

---

## 9. Forest UX Polish

**Priority:** Medium  
**Plan:** [forest-ux-polish-plan.md](forest-ux-polish-plan.md)

### Why
Forest is the public front door. Normal users need a beautiful, trustworthy discovery experience.

### Main outcome
Creator profiles, ShellName profiles, search, tags, language pages, badges, and proof pages.

---

## 10. Canopy Future Dashboard

**Priority:** Medium-Low  
**Plan:** [canopy-future-project-plan.md](canopy-future-project-plan.md)

### Why
Canopy becomes useful when creators manage multiple sites, ShellNames, deployments, comments, and agents.

### Main outcome
A dashboard above the ecosystem, starting local/browser-based.

---

## 11. ShellSeed Decentralized Hosting / Seeding

**Priority:** Experimental / Later  
**Plan:** [shellseed-decentralized-hosting-plan.md](shellseed-decentralized-hosting-plan.md)

### Why
This solves decentralized hosting and supporter-powered bandwidth/storage.

### Main outcome
Signed public bundles can be seeded by creators and supporters, then resolved through Forest/ShellNames.

---

## 12. PostSnail Inbox / MailSnail

**Priority:** Future  
**Plan:** [postsnail-inbox-mailsnail-future-plan.md](postsnail-inbox-mailsnail-future-plan.md)

### Why later
Private messaging is harder than public publishing and comments. It should wait until identity, comments, resolver, and vaults are stable.

### Main outcome
Future encrypted creator inbox and later MailSnail private messaging.

---

# Codex Execution Instructions

When starting a sprint:

1. Read this roadmap.
2. Open the sprint’s linked MD plan.
3. Check the repository state.
4. Do not break existing `.postsnail` workspaces or public ZIP export.
5. Preserve all existing working features.
6. Implement the smallest complete version that satisfies the acceptance criteria.
7. Add or update docs.
8. Add tests or documented manual checks.
9. Finish with a summary: files changed, features implemented, tests run, limitations, and next steps.

## Sprint Safety Rules

```txt
Never upload .postsnail workspace unless explicitly working on private workspace features.
Never expose private keys.
Never remove ZIP download fallback.
Never make Forest the owner of identity.
Never make ShellName stronger than Shell ID.
Never make plugins load globally by default.
Never silently discard unknown plugin/theme/workspace data.
```

---

# Recommended Codex Prompt

Paste this with the current sprint name:

```txt
Read `postsnail-master-roadmap-for-codex.md` first. Then execute Sprint [NUMBER]: [SPRINT NAME] using the linked plan file. Preserve all existing PostSnail behavior, protect `.postsnail` workspace privacy, keep ZIP export working, add tests/docs, and finish with a summary of files changed, tests run, known limitations, and next steps.
```

---

# Current Best Next Sprint

```txt
Sprint 1: Compatibility / Migrations / PSEP Rules
```

This should be completed before deeper plugin/theme/comment/network work.
