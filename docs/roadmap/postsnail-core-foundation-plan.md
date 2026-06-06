# PostSnail Core Foundation — Codex Plan

## Purpose

This document defines the PostSnail Core Foundation.

PostSnail Core must stay tiny, fast, secure, and stable while allowing the ecosystem to grow through plugins, themes, admins, CLI tools, agents, and trackers.

The goal is to make PostSnail flexible like WordPress, but without WordPress-style plugin bloat, global hooks, slow public pages, fragile upgrades, or unsafe plugin behavior.

---

## Product Sentence

```txt
PostSnail Core is the small trusted engine that opens the encrypted shell, signs the trail, verifies the output, and lets optional extensions do the rest.
```

---

## Core Philosophy

```txt
Small core.
Strict protocols.
Optional extensions.
Route-level loading.
Static-first output.
Local-first ownership.
```

Core should not try to become a full CMS by itself.

Core should provide the stable foundation that lets official and third-party tools build on top safely.

---

## What Core Owns

PostSnail Core owns:

```txt
.postsnail workspace vault
workspace encryption/decryption
workspace schema
workspace migrations
identity and key management
signing and verification
canonical JSON
hashing/fingerprints
public static export pipeline
manifest generation
proof files
compatibility rules
PSEP rules
plugin loader
theme registry
permission system
route asset map
export safety checks
verification engine
```

---

## What Core Must Not Become

Core must not become:

```txt
full CMS UI
comments system
theme marketplace
hosting provider
deployment provider
forest tracker
ShellNames registry
analytics system
email/messaging system
generic plugin marketplace
```

Those belong to official plugins, apps, or ecosystem services.

---

## Core Modules

Recommended module structure:

```txt
src/core/
  workspace/
    workspace.js
    workspaceCrypto.js
    workspaceSchema.js
    migrations.js

  identity/
    keys.js
    signing.js
    verification.js

  protocol/
    protocol.js
    compatibility.js
    canonicalJson.js
    hashes.js
    pseps.js

  export/
    exporter.js
    routes.js
    manifest.js
    proofFiles.js
    safety.js

  plugins/
    pluginRegistry.js
    pluginManifest.js
    pluginPermissions.js
    pluginHooks.js
    pluginMigrations.js

  themes/
    themeRegistry.js
    themeManifest.js
    themeTokens.js
    templateSlots.js

  assets/
    routeAssets.js
    assetBudget.js
    sanitizer.js
```

Existing files may be refactored into this shape gradually. Do not rewrite everything at once if not needed.

---

## Core Public API

Create or prepare a stable core API that can be used by:

```txt
official PostSnail Admin
PostSnail CLI
third-party admins
Aurel / agents
SnailLift
Canopy
plugins
themes
test suites
```

Suggested API:

```js
import {
  openWorkspace,
  saveWorkspace,
  migrateWorkspace,
  validateWorkspace,
  buildSite,
  verifyExport,
  signManifest,
  verifyManifest,
  registerPlugin,
  registerTheme
} from "@postsnail/core";
```

If publishing as a package is not ready, still structure the internal API as if it could become `@postsnail/core` later.

---

## Workspace Rules

The `.postsnail` file is the private encrypted editable source.

Core must guarantee:

```txt
workspace decrypts only with passphrase
workspace migrations are deterministic
old workspaces remain importable
future unsupported workspaces fail safely
raw private keys are never accepted in backups
plugin state is preserved
unknown optional state is preserved
```

Workspace must contain:

```txt
posts
pages if plugin adds them
assets
profile
identity
settings
commit history
theme settings
plugin states
deployment settings
ShellNames
moderation state if comments plugin exists
```

Public ZIP must never contain private workspace data.

---

## Compatibility Rules

Core must follow permanent compatibility rules:

```txt
Old .postsnail files must keep opening.
Old public ZIP exports must keep verifying when valid.
New features are optional extensions unless explicitly required.
Unknown optional fields are ignored or preserved.
Unknown required features fail clearly.
Every workspace version upgrade needs a migration.
```

Use:

```txt
requiredFeatures
optionalFeatures
extensions
schemaVersion
protocolVersion
```

Core should enforce these rules across workspace, manifest, identity, commits, plugins, themes, and trackers.

---

## PSEP Rules

PSEP means PostSnail Enhancement Proposal.

Any change that affects protocol compatibility must have a PSEP.

A PSEP must define:

```txt
feature name
motivation
new files/fields
required vs optional features
migration rules
verifier behavior
security impact
backward compatibility impact
tests required
```

Core should include a PSEP template in:

```txt
docs/pseps/PSEP-template.md
```

---

## Plugin System Core

PostSnail plugins must be capability-based and scoped.

Golden rule:

```txt
Install does not mean load.
Enable does not mean load everywhere.
Public assets load only where needed.
```

Plugin manifest example:

```json
{
  "id": "postsnail-pages",
  "name": "PostSnail Pages",
  "version": "0.1.0",
  "capabilities": [
    "contentTypes",
    "adminPanel",
    "exportRoutes",
    "exportAssets",
    "storePluginState"
  ],
  "admin": {
    "entry": "admin/plugin.js",
    "loadWhen": ["admin:pages", "admin:navigation"]
  },
  "export": {
    "hooks": ["build:routes", "build:sitemap"]
  },
  "runtime": {
    "entry": "runtime/pages.js",
    "loadWhen": ["routeType:page"]
  },
  "permissions": [
    "read:posts",
    "write:pluginState",
    "export:routes",
    "export:assets"
  ]
}
```

Core must support:

```txt
plugin registry
plugin manifest validation
plugin permissions
plugin state in .postsnail
plugin migrations
export hooks
admin hooks
runtime asset declarations
route-level loading
```

---

## Plugin Safety Rules

Plugins must not:

```txt
run globally by default
load public assets everywhere
read private workspace data without permission
delete unknown plugin state
modify core identity without permission
deploy files by themselves
send data remotely without permission
```

Core should warn when plugins request dangerous capabilities.

---

## Theme System Core

Themes are first-class, but themes are not plugins.

Frontend themes control public site appearance.

Admin themes control PostSnail Admin appearance.

### Frontend themes may control:

```txt
layouts
templates
CSS
typography
colors
post/page/archive/tag templates
template slots
image sizes
optional small JS
```

### Admin themes should start as:

```txt
CSS variables only
appearance tokens
density/layout settings
light/dark themes
```

Admin themes must not run arbitrary logic in MVP.

---

## Theme Manifest

Example frontend theme manifest:

```json
{
  "type": "postsnail-frontend-theme",
  "id": "forest-minimal",
  "name": "Forest Minimal",
  "version": "1.0.0",
  "templates": {
    "home": "templates/home.html",
    "post": "templates/post.html",
    "page": "templates/page.html",
    "archive": "templates/archive.html",
    "tag": "templates/tag.html"
  },
  "assets": {
    "css": ["assets/theme.css"],
    "js": []
  },
  "settings": {}
}
```

Admin theme manifest:

```json
{
  "type": "postsnail-admin-theme",
  "id": "midnight-shell",
  "name": "Midnight Shell",
  "version": "1.0.0",
  "tokens": {
    "--ps-bg": "#101318",
    "--ps-panel": "#181d24",
    "--ps-text": "#f4f1e8",
    "--ps-accent": "#c49bff"
  }
}
```

---

## Route-Level Asset Loading

Every route should declare its needed theme/plugin assets.

Example:

```json
{
  "route": "/posts/example/",
  "type": "post",
  "template": "post",
  "theme": "forest-minimal",
  "plugins": ["postsnail-comments"],
  "assets": [
    "/themes/forest-minimal/theme.css",
    "/postsnail-comments/comments.js",
    "/postsnail-comments/comments.css"
  ]
}
```

This prevents global plugin/theme bloat.

---

## Build-Time First

Core should prefer build-time/static output.

Plugin rule:

```txt
If it can be generated at build time, do not require public runtime JavaScript.
```

Examples:

```txt
Pages plugin = build-time only
Themes = mostly build-time/CSS
Comments = runtime only on comment-enabled posts
Search = static index + optional JS
Gallery = JS only on gallery pages
```

---

## Performance Budgets

Plugins and themes should declare budgets.

Example:

```json
{
  "budgets": {
    "runtimeJsMaxKb": 25,
    "runtimeCssMaxKb": 10,
    "exportTimeMaxMs": 500
  }
}
```

Core should warn when a plugin or theme exceeds budget.

---

## Official First-Party Extensions

Core should support official bundled extensions, but not merge them all into core.

Official extensions may include:

```txt
PostSnail Pages
PostSnail Comments
SnailLift
ShellNames integration
Forest integration
Themes
Search
Gallery
```

They should still use the same plugin/theme system as third-party extensions where possible.

---

## Third-Party Admins

PostSnail should allow other admins to open `.postsnail` files.

Core must provide stable APIs/specs so other admins can:

```txt
open workspace
preserve unknown data
edit supported content
run migrations safely
export valid static sites
verify output
```

Critical rule:

```txt
Unknown plugin/theme/content state must be preserved.
```

If a simple editor opens a workspace with comments but does not support comments, it must not delete comment state.

---

## Security Rules

Core must enforce:

```txt
never expose raw private keys
never upload .postsnail workspace during public deploy
never include drafts in public ZIP
never include rejected comments/private state in public ZIP
never trust plugin output without export safety checks
never trust tracker content without verification
never silently accept unknown required features
```

---

## Docs To Create / Update

Create or update:

```txt
docs/core-foundation.md
docs/plugin-system.md
docs/theme-system.md
docs/route-assets.md
docs/permissions.md
docs/compatibility.md
docs/workspace-vault.md
docs/security.md
docs/pseps/PSEP-template.md
README.md
```

---

## Tests

Add tests for:

```txt
workspace opens and saves
workspace migration preserves unknown plugin state
public export excludes private workspace data
plugin manifest validates
plugin permissions validate
unknown optional plugin state is preserved
unknown required feature fails
theme manifest validates
admin theme tokens validate
route asset map includes only needed assets
runtime assets are not globally injected
export safety blocks private data
legacy workspace still imports
future workspace version fails safely
```

---

## Acceptance Criteria

Done when:

1. Core responsibility boundaries are documented.
2. Core modules/API are organized or planned clearly.
3. Plugin manifest and permission rules exist.
4. Theme manifest rules exist.
5. Route-level asset loading is specified or implemented.
6. Workspace/plugin/theme state preservation is protected.
7. Public export safety rules are enforced.
8. Compatibility/PSEP rules are integrated.
9. Tests cover plugin/theme/core safety rules.
10. Docs explain how PostSnail stays extensible without WordPress-style bloat.

---

## Strategic Order

Run this before building deeper CMS/plugin work.

Recommended order:

```txt
1. Core Foundation
2. Plugin System Core
3. Theme System Core
4. PostSnail Pages plugin
5. PostSnail Comments refinement
6. SnailLift integration as plugin/provider
```

---

## Final Ecosystem Sentence

```txt
PostSnail Core opens the shell and signs the trail.
Plugins add features.
Themes shape the experience.
Routes decide what loads.
The public site stays fast.
The creator stays in control.
```
