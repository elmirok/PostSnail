# PostSnail Plugin System Core + Theme System Spec — Codex Plan

## Purpose

This plan defines the official PostSnail extension foundation.

PostSnail should become flexible like WordPress, but without WordPress-style bloat, global hooks, slow public pages, unsafe plugins, or themes that load everywhere.

This sprint must design and implement the foundations for:

```txt
Plugin System Core
Theme System Spec
Route-level asset loading
Plugin permissions
Plugin state in .postsnail workspace
Theme state in .postsnail workspace
Admin themes
Frontend themes
Template slots
Performance budgets
```

This should be done before building deeper CMS features, PostSnail Pages, Comments refinement, SnailLift-as-plugin, theme galleries, or third-party plugin support.

---

## Product Sentence

```txt
PostSnail extensions add power without owning the shell, slowing every page, or breaking old workspaces.
```

---

## Core Philosophy

```txt
Install does not mean load.
Enable does not mean load everywhere.
Public assets load only where needed.
Themes style; plugins add behavior.
Core stays tiny.
The public site stays fast.
```

---

## Relationship to Core Foundation

This sprint depends on:

```txt
docs/roadmap/postsnail-core-foundation-plan.md
```

Core Foundation defines what PostSnail Core owns.

This sprint implements the extension layer that connects safely to core.

---

## Non-Negotiable Rules

Plugins must not:

```txt
run globally by default
load assets on every public page
read private workspace data without permission
delete unknown plugin/theme state
modify identity keys without explicit permission
silently upload data
silently deploy files
bypass export safety checks
mutate core state directly
```

Themes must not:

```txt
secretly become plugins
run arbitrary admin logic in MVP
load JavaScript globally by default
access private workspace data
override plugin behavior silently
```

---

# 1. Plugin System Core

## 1.1 Plugin Types

Support three execution layers.

### Admin Plugins

Run only inside PostSnail Admin.

Used for:

```txt
admin panels
settings screens
moderation dashboards
content editors
SEO tools
image tools
deployment UI
```

Admin plugins must load only in declared admin sections.

### Build / Export Plugins

Run only during static site generation.

Used for:

```txt
adding routes
creating JSON files
copying assets
generating indexes
adding sitemap entries
adding feed entries
signing plugin output
```

### Public Runtime Plugins

Run on the published static website only where needed.

Used for:

```txt
comment rendering
local search
gallery UI
interactive widgets
live tracker calls
```

---

## 1.2 Plugin Manifest

Create a plugin manifest format:

```json
{
  "protocol": "postsnail-plugin-v1",
  "id": "postsnail-comments",
  "name": "PostSnail Comments",
  "version": "0.1.0",
  "description": "Signed hybrid comments for static PostSnail blogs.",
  "author": "PostSnail",
  "type": "official",
  "compatibleCore": {
    "min": "0.1.0",
    "max": ""
  },
  "requiredFeatures": [],
  "optionalFeatures": [],
  "capabilities": [
    "adminPanel",
    "exportAssets",
    "runtimeAssets",
    "storePluginState"
  ],
  "permissions": [
    "read:posts",
    "write:pluginState",
    "export:assets",
    "fetch:trackers"
  ],
  "admin": {
    "entry": "admin/plugin.js",
    "loadWhen": ["admin:comments"]
  },
  "export": {
    "hooks": ["build:routes", "build:assets"]
  },
  "runtime": {
    "entry": "runtime/comments.js",
    "css": ["runtime/comments.css"],
    "loadWhen": ["routeType:post", "feature:comments-enabled"]
  },
  "state": {
    "schemaVersion": 1,
    "migration": "migrations/index.js"
  },
  "budgets": {
    "runtimeJsMaxKb": 30,
    "runtimeCssMaxKb": 15,
    "exportTimeMaxMs": 1000
  }
}
```

---

## 1.3 Plugin Registry

Create:

```txt
src/core/plugins/pluginRegistry.js
```

Responsibilities:

```txt
install plugin
enable plugin
disable plugin
validate manifest
list installed plugins
list enabled plugins
resolve plugin by id
load admin plugin only when needed
load export plugin only during build
load runtime assets only for matching routes
```

---

## 1.4 Plugin Permissions

Create:

```txt
src/core/plugins/pluginPermissions.js
```

Permission examples:

```txt
read:posts
write:posts
read:pages
write:pages
read:assets
write:assets
read:profile
write:profile
read:manifest
write:manifestExtensions
read:pluginState
write:pluginState
export:routes
export:assets
export:sitemap
export:feeds
fetch:trackers
fetch:external
deploy:provider
```

Dangerous permissions should trigger warnings:

```txt
write:identity
write:manifest
deploy:provider
fetch:external
read:allWorkspace
```

MVP should support official bundled plugins first. Third-party plugin installation can remain future work.

---

## 1.5 Plugin State

Plugin state must live inside the encrypted `.postsnail` workspace.

Example:

```json
{
  "plugins": {
    "installed": [
      {
        "id": "postsnail-comments",
        "version": "0.1.0",
        "enabled": true,
        "manifestHash": "sha3-512:..."
      }
    ],
    "state": {
      "postsnail-comments": {
        "schemaVersion": 1,
        "settings": {},
        "approvedComments": [],
        "blockedPublicKeys": []
      }
    }
  }
}
```

Rules:

```txt
plugin state is private by default
plugin state migrates with workspace
unknown plugin state must be preserved
missing plugin code must not delete state
public export includes only explicit public plugin output
```

---

## 1.6 Plugin Migrations

Create:

```txt
src/core/plugins/pluginMigrations.js
```

Rules:

```txt
each plugin state has schemaVersion
plugin migrations are deterministic
plugin migrations preserve unknown fields
missing plugin code must not delete plugin state
unsupported future plugin state fails safely or preserves state untouched
```

If a workspace contains plugin state for a missing plugin, show:

```txt
This workspace uses plugin X, but it is not installed. Its state is preserved.
```

---

## 1.7 Plugin Hooks

Create a typed hook system.

MVP hooks:

```txt
admin:registerPanels
admin:registerSettings
workspace:migrate
export:beforeBuild
export:routes
export:assets
export:sitemap
export:feeds
export:manifestExtensions
export:afterBuild
verify:publicOutput
```

Rules:

```txt
hooks must be explicit
no global hidden hooks
hook order must be deterministic
plugins cannot silently override core output
plugins must return structured changes
```

---

# 2. Theme System Spec

Themes are first-class, but themes are not plugins.

Rule:

```txt
A theme can style.
A plugin can add behavior.
A theme should not secretly become a plugin.
```

---

## 2.1 Theme Types

Support two theme types.

### Frontend Themes

Control the public exported PostSnail site.

Can define:

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

### Admin Themes

Control the PostSnail Admin appearance.

MVP admin themes should be:

```txt
CSS variables only
appearance tokens
density/layout settings
light/dark themes
```

Admin themes must not run arbitrary logic in MVP.

---

## 2.2 Frontend Theme Manifest

Example:

```json
{
  "protocol": "postsnail-theme-v1",
  "type": "postsnail-frontend-theme",
  "id": "forest-minimal",
  "name": "Forest Minimal",
  "version": "1.0.0",
  "compatibleCore": {
    "min": "0.1.0",
    "max": ""
  },
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
  "slots": [
    "siteHeader",
    "postHeader",
    "postBody",
    "postFooter",
    "comments",
    "siteFooter"
  ],
  "settings": {
    "accentColor": "#8fbc8f",
    "fontStyle": "serif"
  },
  "budgets": {
    "runtimeJsMaxKb": 10,
    "runtimeCssMaxKb": 30
  }
}
```

---

## 2.3 Admin Theme Manifest

Example:

```json
{
  "protocol": "postsnail-theme-v1",
  "type": "postsnail-admin-theme",
  "id": "midnight-shell",
  "name": "Midnight Shell",
  "version": "1.0.0",
  "tokens": {
    "--ps-bg": "#101318",
    "--ps-panel": "#181d24",
    "--ps-text": "#f4f1e8",
    "--ps-accent": "#c49bff"
  },
  "density": "comfortable"
}
```

---

## 2.4 Theme Registry

Create:

```txt
src/core/themes/themeRegistry.js
src/core/themes/themeManifest.js
src/core/themes/themeTokens.js
src/core/themes/templateSlots.js
```

Responsibilities:

```txt
validate theme manifests
register frontend themes
register admin themes
select active frontend theme
select active admin theme
store theme settings in .postsnail workspace
resolve templates during export
resolve CSS variables for admin UI
```

---

## 2.5 Theme State

Store in `.postsnail` workspace:

```json
{
  "appearance": {
    "frontendTheme": "forest-minimal",
    "adminTheme": "midnight-shell",
    "themeSettings": {
      "forest-minimal": {},
      "midnight-shell": {}
    }
  }
}
```

---

# 3. Route-Level Asset Loading

Every generated route must declare assets.

Example:

```json
{
  "route": "/posts/example/",
  "type": "post",
  "template": "post",
  "theme": "forest-minimal",
  "features": ["comments-enabled"],
  "plugins": ["postsnail-comments"],
  "assets": [
    "/themes/forest-minimal/theme.css",
    "/postsnail-comments/comments.js",
    "/postsnail-comments/comments.css"
  ]
}
```

No plugin runtime JS should be injected globally unless explicitly required and approved.

Create:

```txt
src/core/assets/routeAssets.js
```

Responsibilities:

```txt
collect theme assets for route
collect plugin runtime assets for route
deduplicate assets
prevent global accidental injection
emit route asset map
warn on unused global assets
```

---

# 4. Build-Time First Rule

Core should prefer build-time/static output.

Rule:

```txt
If it can be generated at build time, do not require public runtime JavaScript.
```

Examples:

```txt
PostSnail Pages = build-time only
Frontend themes = mostly CSS/templates
Comments = runtime only on comment-enabled posts
Search = static index + optional JS
Gallery = JS only on gallery pages
```

---

# 5. Export Pipeline Integration

During export:

```txt
1. Core builds base routes.
2. Enabled build plugins add declared routes/assets.
3. Active frontend theme resolves templates.
4. Route asset map is generated.
5. Public output safety scan runs.
6. Manifest includes plugin/theme output metadata.
7. ZIP/static files are generated.
8. Verification runs.
```

Manifest should include extension metadata:

```json
{
  "extensions": {
    "plugins": {
      "postsnail-comments": {
        "version": "0.1.0",
        "publicFiles": [
          "/postsnail-comments/comments.js",
          "/postsnail-comments/approved-comments.json"
        ]
      }
    },
    "themes": {
      "frontend": {
        "id": "forest-minimal",
        "version": "1.0.0"
      }
    }
  }
}
```

---

# 6. Official Bundled Extensions

Official extensions should use the same APIs.

Potential official plugins:

```txt
PostSnail Pages
PostSnail Comments
SnailLift
ShellNames Integration
Forest Integration
Search
Gallery
```

Potential official themes:

```txt
Forest Minimal
Classic Shell
Midnight Shell
Plain Text
Docs Clean
```

---

# 7. Third-Party Support Later

Do not build marketplace yet.

Prepare for:

```txt
local plugin folder
plugin ZIP package
plugin integrity hash
plugin signature
manual confirmation
permission review
```

Third-party plugin support should come only after official plugin APIs are stable.

---

# 8. Public ZIP Safety

Public export must never include:

```txt
.postsnail workspace
backup JSON
raw private keys
encrypted workspace payload
drafts
rejected comments
private moderation notes
private plugin state
.env
secrets
```

Plugin/theme output must pass export safety scan.

---

# 9. Docs

Create/update:

```txt
docs/plugin-system.md
docs/theme-system.md
docs/route-assets.md
docs/plugin-permissions.md
docs/plugin-migrations.md
docs/theme-manifests.md
docs/extension-security.md
docs/core-foundation.md
README.md
```

Docs must explain:

```txt
why plugins are scoped
why themes are separate from plugins
how plugin state is stored
how theme state is stored
how route-level loading works
why this avoids WordPress bloat
how official bundled plugins should behave
what third-party plugin support will require later
```

---

# 10. Tests

Add tests for:

```txt
plugin manifest validates
invalid plugin manifest fails
permissions validate
dangerous permission warns
plugin state saved in workspace
missing plugin preserves state
plugin migration preserves unknown fields
theme manifest validates
admin theme tokens validate
frontend theme templates resolve
route asset map includes only needed assets
plugin runtime not globally injected
theme assets not duplicated
public export blocks private data
manifest includes plugin/theme metadata
legacy workspace without plugins/themes still opens
unknown optional plugin/theme state is preserved
```

---

# 11. Acceptance Criteria

Done when:

1. Plugin manifest format exists.
2. Plugin registry exists.
3. Plugin permissions exist.
4. Plugin state is stored in `.postsnail`.
5. Missing plugin state is preserved.
6. Plugin hook system exists or is clearly scaffolded.
7. Frontend theme manifest exists.
8. Admin theme manifest exists.
9. Theme registry exists.
10. Route-level asset loading is implemented or fully scaffolded.
11. Public ZIP safety scan covers plugin/theme output.
12. Docs explain the system.
13. Tests cover plugin/theme safety and route-level loading.

---

# 12. Strategic Order After This Sprint

After this, build:

```txt
1. PostSnail Pages plugin
2. PostSnail Comments refinement
3. SnailLift provider as plugin
4. Theme gallery / official themes
5. Canopy dashboard integration
```

---

# Final Ecosystem Sentence

```txt
PostSnail Core opens the shell and signs the trail.
Plugins add features.
Themes shape the experience.
Routes decide what loads.
The public site stays fast.
The creator stays in control.
```
