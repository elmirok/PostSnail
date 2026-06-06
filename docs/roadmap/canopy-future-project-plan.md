# Canopy — Future PostSnail Ecosystem Dashboard Plan

## Product Summary

**Canopy** is the future premium control layer for the PostSnail ecosystem.

It is not the creator’s home, and it is not the source of truth.

Canopy is the dashboard above the forest: a place where creators can manage their PostSnail sites, ShellNames, deployments, comments, reports, trackers, and publishing workflows from one clean interface.

Product sentence:

> Canopy is the command center for creators carrying their own shells.

Short tagline:

> See the forest. Keep your shell.

---

## Core Philosophy

```txt
PostSnail = publishing system
.postsnail workspace = private encrypted shell
SnailLift = deployment assistant
Forest = discovery layer
ShellNames = readable forest aliases
Comments = signed discussion layer
Canopy = ecosystem dashboard
```

Canopy should never own the creator’s identity, source files, private workspace, or hosting account.

It should make the ecosystem easier to operate.

---

## Strategic Role

Canopy is a future project that should be built only after these foundations are working:

```txt
1. .postsnail encrypted workspace
2. Forest tracker
3. Compatibility / migrations / PSEP rules
4. Cloudflare deploy / SnailLift
5. ShellNames
6. PostSnail Comments
7. Plugin System Core
```

Canopy should not be built too early.

It becomes valuable when creators have multiple moving parts to manage.

---

## What Canopy Is

Canopy is:

```txt
dashboard
control panel
ecosystem overview
multi-site manager
publishing assistant
comment moderation center
deployment monitor
forest visibility tool
agent workflow monitor
```

Canopy is not:

```txt
hosting company
central identity provider
source of truth
social network
DNS provider
required PostSnail account
generic static hosting platform
```

---

## User Types

### 1. Solo Creator

A person with one PostSnail blog.

Needs:

```txt
site health
deploy status
forest listing
ShellName status
comments inbox
latest posts
backup reminders
simple analytics-free visibility
```

### 2. Power Creator

A person with multiple PostSnail sites.

Needs:

```txt
multi-site dashboard
multiple ShellNames
multiple deploy targets
comment moderation across sites
posting schedule
deployment logs
rollback helper
```

### 3. Agent-Driven Creator

A creator using agents like Aurel Shellscribe.

Needs:

```txt
agent queue monitor
draft approval queue
auto-publish status
weekly report archive
failed publish alerts
safety pause switch
```

### 4. Community Maintainer

A person running a forest/tracker/community.

Needs:

```txt
forest health
name registry moderation
reported sites
verified creators
pending submissions
abuse queue
community tags/languages
```

---

## MVP Vision

The first Canopy MVP should be a **read-only control dashboard**.

It should not start by controlling everything.

### MVP Features

```txt
connect/import a .postsnail workspace summary
show public site status
show deployment status
show forest listing status
show ShellName status
show latest comments/pending comments
show latest bundle fingerprint
show backup age warning
show links to PostSnail Admin, SnailLift, Forest, and ShellNames
```

### MVP Rule

Canopy should not require uploading the private `.postsnail` workspace.

The safest MVP should work by reading public proof files and optional local workspace metadata.

---

## Architecture Options

## Option A — Local-Only Canopy

Canopy runs in the browser and stores everything locally.

```txt
Canopy static app
   ↓
user imports/connects local data
   ↓
fetches public proof files
   ↓
shows dashboard
```

Pros:

```txt
most private
no server
aligned with PostSnail
cheap
safe
```

Cons:

```txt
harder to sync across devices
no background checks unless opened
limited notifications
```

Best for first version.

---

## Option B — Creator-Owned Canopy

Canopy is deployed by the creator to their own Cloudflare account.

```txt
Creator-owned Canopy Worker
   ↓
checks site status
checks deployments
checks forest
checks comments
```

Pros:

```txt
background checks
creator owns infrastructure
can send alerts
more powerful
```

Cons:

```txt
harder setup
requires Cloudflare/GitHub tokens
more technical
```

Good for advanced users later.

---

## Option C — Hosted Canopy Service

A central hosted dashboard.

Pros:

```txt
best UX
easy onboarding
paid tier possible
alerts and monitoring
```

Cons:

```txt
more centralization
more privacy risk
more cost
more support burden
more trust required
```

Only build this if there is clear demand.

---

## Recommended Direction

Start with:

```txt
Canopy Local
```

Then later add:

```txt
Canopy Connectors
Canopy Worker
Canopy Hosted optional
```

Do not make hosted Canopy mandatory.

---

## Core Data Model

Canopy should track:

```json
{
  "sites": [
    {
      "siteId": "psn1-...",
      "title": "",
      "siteUrl": "",
      "manifestUrl": "",
      "wellKnownUrl": "",
      "bundleFingerprint": "",
      "publicKey": "",
      "lastCheckedAt": "",
      "status": "healthy"
    }
  ],
  "shellNames": [],
  "deployments": [],
  "comments": [],
  "forests": [],
  "agents": [],
  "alerts": []
}
```

---

## Main Dashboard Sections

## 1. Sites

Show:

```txt
site title
site URL
latest bundle fingerprint
manifest status
well-known status
feed status
sitemap status
last checked
deploy status
forest status
```

Actions:

```txt
open site
open manifest
verify site
open in Forest
deploy with SnailLift
open PostSnail Admin
```

---

## 2. ShellNames

Show:

```txt
full ShellName
forest
status
expiry date
linked shell ID
linked site URL
verification status
```

Actions:

```txt
renew
update
open profile
copy name
verify signed record
```

---

## 3. Deployments

Show:

```txt
provider
site
latest deploy
status
deployment URL
bundle fingerprint
forest announce status
errors
```

Actions:

```txt
redeploy with SnailLift
verify live
rollback helper
view logs
```

---

## 4. Comments

Show:

```txt
pending comments
approved comments
rejected comments
blocked authors
live tracker comments
comment tracker health
```

Actions:

```txt
approve
reject
block
export approved
open moderation dashboard
```

---

## 5. Forest Visibility

Show:

```txt
is site listed in forest?
tags/language
recent ranking/discovery status
ShellName visibility
tracker verification status
```

Actions:

```txt
announce site
refresh listing
open forest profile
```

---

## 6. Agents

For Aurel and future agents.

Show:

```txt
agent name
mode: paused / approval required / full-auto
last draft
last publish
failed tasks
weekly report status
queue size
```

Actions:

```txt
pause
resume
require approval
open latest report
open drafts queue
```

---

## 7. Alerts

Examples:

```txt
workspace backup is old
live manifest mismatch
forest listing failed
ShellName expiring soon
deployment failed
comments tracker offline
agent publish failed
feed missing
sitemap missing
```

---

## Security Rules

Canopy must follow these rules:

```txt
Never upload .postsnail workspace by default.
Never store raw private keys.
Never store API tokens unencrypted.
Never deploy anything by itself unless explicitly configured.
Never become required for publishing.
Never claim ownership of site identity.
Always verify signatures/hashes locally when possible.
```

---

## Canopy and Tokens

If Canopy supports deploy actions, tokens must be handled carefully.

Rules:

```txt
default: do not store tokens
optional: store encrypted in local Canopy vault
advanced: use creator-owned Worker
preferred future: OAuth or short-lived tokens
```

Never store Cloudflare/GitHub tokens in plain text.

---

## Pricing / Business Model

Canopy can become a paid layer later.

### Free

```txt
local dashboard
1–3 sites
manual checks
basic ShellName status
basic forest status
```

### Snail

```txt
more sites
deployment logs
comment moderation dashboard
backup reminders
ShellName renewal alerts
SnailLift integration
```

### Turbo Snail

```txt
multi-site
agent monitoring
scheduled checks
auto health reports
team access later
advanced forest visibility
creator-owned Worker integration
```

Canopy should sell convenience, not control.

---

## Branding

### Name

```txt
Canopy
```

### Meaning

The canopy is the high view above the forest.

It helps creators see:

```txt
their shell
their trails
their names
their comments
their deployments
their forest presence
```

### Taglines

```txt
See the forest. Keep your shell.
The dashboard above your signed trails.
A calm control center for PostSnail creators.
Manage your trails without giving up your shell.
```

### Visual Direction

```txt
premium forest dashboard
deep greens
warm amber lights
snail shell geometry
clean cards
map-like overview
calm, not corporate
```

---

## Codex Goal

Work in the PostSnail ecosystem.

Create the future plan and MVP architecture for **Canopy**, a PostSnail ecosystem dashboard.

Do not build a hosted central service first. Start with a local/browser-based MVP.

Implement or prepare:

```txt
docs/canopy.md
docs/canopy-architecture.md
docs/canopy-security.md
canopy/README.md
canopy/src/ prototype structure if practical
```

MVP should focus on:

```txt
site status
forest status
ShellName status
deployment status
comments status
agent status placeholder
alerts
```

Do not require uploading `.postsnail`.

---

## Suggested Repo Structure

If separate repo:

```txt
postsnail-canopy/
├── README.md
├── docs/
│   ├── canopy.md
│   ├── architecture.md
│   ├── security.md
│   ├── roadmap.md
│   └── connectors.md
├── src/
│   ├── app.js
│   ├── state.js
│   ├── verifier.js
│   ├── connectors/
│   │   ├── forest.js
│   │   ├── shellnames.js
│   │   ├── snaillift.js
│   │   └── comments.js
│   └── ui/
└── tests/
```

If inside PostSnail monorepo:

```txt
apps/canopy/
docs/canopy/
```

---

## MVP Implementation Plan

### Phase 1 — Static Prototype

Build a static dashboard UI with mock data.

Cards:

```txt
Sites
ShellNames
Deployments
Comments
Forest
Agents
Alerts
```

### Phase 2 — Public Site Verification

Allow user to add site URL.

Fetch:

```txt
/postsnail.manifest.json
/.well-known/postsnail.json
/feed.json
/sitemap.xml
```

Show health status.

### Phase 3 — Forest Connector

Fetch forest listing for a site/shell.

Show:

```txt
listed / not listed
last seen
verification status
tags
ShellName
```

### Phase 4 — ShellNames Connector

Resolve ShellName and verify signed record.

### Phase 5 — Deployment Connector

Read local deployment log if available, or connect to SnailLift data.

### Phase 6 — Comments Connector

Show pending/live/approved comment counts if plugin data or tracker endpoint is configured.

### Phase 7 — Agent Status Placeholder

Support Aurel-style status files:

```txt
agent-status.json
latest-report.md
queue counts
pause status
```

---

## Tests

Add tests for:

```txt
site URL normalization
manifest fetch/parse
well-known fetch/parse
fingerprint comparison
forest connector parsing
ShellName record parsing
unknown optional fields ignored
bad manifest shows error
missing sitemap shows warning
no .postsnail upload required
token fields never saved unencrypted
```

---

## Acceptance Criteria

Done when:

1. Canopy plan/docs exist.
2. MVP dashboard structure exists.
3. User can add a PostSnail site URL.
4. Canopy can fetch and display basic public proof status.
5. Forest connector is documented or stubbed.
6. ShellNames connector is documented or stubbed.
7. SnailLift/deploy status connector is documented or stubbed.
8. Comments connector is documented or stubbed.
9. Agent status placeholder exists.
10. Security docs explain what Canopy must never own.
11. Roadmap explains local → creator-owned → hosted optional path.

---

## Future Features

```txt
multi-site dashboard
ShellName renewal alerts
comment moderation center
SnailLift integration
Aurel agent monitor
weekly ecosystem report view
public/private dashboard modes
creator-owned Worker checks
optional hosted notifications
team mode
theme/plugin marketplace view
forest map visualization
```

---

## Final Ecosystem Sentence

```txt
PostSnail creates the shell and trail.
SnailLift publishes the trail.
Forest helps people find it.
ShellNames gives it a readable path.
Comments bring conversation.
Canopy helps the creator see and manage it all.
```
