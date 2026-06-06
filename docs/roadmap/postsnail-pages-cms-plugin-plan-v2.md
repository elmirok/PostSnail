# PostSnail Pages / CMS Plugin — Codex Plan

## Priority

High

## Purpose

**PostSnail Pages** is the official first-party CMS plugin for PostSnail.

It turns PostSnail from a microblog-only tool into a tiny, fast, static-first, local-first website CMS without bloating the core.

This plugin should be powerful enough to manage `postsnail.org`, documentation, tutorials, landing pages, changelog pages, and roadmap pages while keeping PostSnail Core small and fast.

---

## Product Sentence

```txt
PostSnail Pages lets a .postsnail workspace become a full static website CMS without turning PostSnail Core into WordPress.
```

---

## Dependencies

This sprint depends on:

```txt
docs/roadmap/postsnail-core-foundation-plan.md
docs/roadmap/postsnail-plugin-theme-system-plan.md
```

PostSnail Core owns:

```txt
workspace vault
identity/signing
export pipeline
plugin loader
theme system
route-level asset loading
verification
```

PostSnail Pages owns:

```txt
pages
docs
tutorials
navigation
FAQ
roadmap
changelog
landing sections
redirects
page SEO
CMS-like content structures
```

---

## Core Rule

Do not add CMS complexity to PostSnail Core.

Build this as an official bundled plugin using the same plugin APIs that future plugins will use.

---

## Main Use Case

The first real user is:

```txt
postsnail.org
```

The official PostSnail website should be managed as:

```txt
postsnail-org.postsnail
```

and published as a signed static website.

---

## Plugin Name

Recommended name:

```txt
PostSnail Pages
```

Plugin ID:

```txt
postsnail-pages
```

---

## What This Plugin Adds

PostSnail Pages adds these content types:

```txt
Page
Doc
Tutorial
FAQ Item
Roadmap Item
Changelog Entry
Landing Section
Redirect
Navigation Item
```

It should also support future custom content types, but MVP should focus on official built-ins.

---

## MVP Scope

### Required MVP

```txt
static pages
docs collection
tutorials collection
navigation editor
FAQ collection
roadmap collection
changelog collection
landing page sections
SEO fields
Markdown frontmatter import
static route generation
sitemap integration
feed integration where useful
theme template slots
public export files
workspace state storage
```

### Do Not Build Yet

```txt
multi-user editing
server database
hosted CMS backend
visual drag-and-drop builder
plugin marketplace
live preview collaboration
comments moderation
analytics
forms
payments
complex workflow permissions
```

---

## Workspace State

All editable CMS data must live in the encrypted `.postsnail` workspace.

Example:

```json
{
  "plugins": {
    "state": {
      "postsnail-pages": {
        "schemaVersion": 1,
        "pages": [],
        "docs": [],
        "tutorials": [],
        "faq": [],
        "roadmap": [],
        "changelog": [],
        "landingSections": [],
        "navigation": [],
        "redirects": [],
        "settings": {}
      }
    }
  }
}
```

Rules:

```txt
plugin state is private by default
public export includes only published content
draft pages stay private
unpublished docs stay private
future unknown fields must be preserved
```

---

## Content Status

Every content item should support:

```txt
draft
published
archived
```

Only `published` content is exported to the public website.

---

## Content Schemas

### Page

```json
{
  "id": "",
  "type": "page",
  "title": "",
  "slug": "",
  "path": "",
  "status": "draft",
  "excerpt": "",
  "body": "",
  "template": "page",
  "seo": {
    "title": "",
    "description": "",
    "canonical": "",
    "image": "",
    "noindex": false
  },
  "createdAt": "",
  "updatedAt": "",
  "publishedAt": ""
}
```

### Doc

```json
{
  "id": "",
  "type": "doc",
  "title": "",
  "slug": "",
  "section": "",
  "order": 0,
  "status": "draft",
  "body": "",
  "seo": {},
  "createdAt": "",
  "updatedAt": "",
  "publishedAt": ""
}
```

### Tutorial

```json
{
  "id": "",
  "type": "tutorial",
  "title": "",
  "slug": "",
  "difficulty": "beginner",
  "status": "draft",
  "excerpt": "",
  "body": "",
  "steps": [],
  "tags": [],
  "seo": {},
  "createdAt": "",
  "updatedAt": "",
  "publishedAt": ""
}
```

### Roadmap Item

```json
{
  "id": "",
  "type": "roadmap",
  "title": "",
  "status": "planned",
  "priority": "medium",
  "description": "",
  "targetPhase": "",
  "public": true,
  "createdAt": "",
  "updatedAt": ""
}
```

### Changelog Entry

```json
{
  "id": "",
  "type": "changelog",
  "version": "",
  "title": "",
  "date": "",
  "status": "published",
  "items": [],
  "body": ""
}
```

---

## Admin UI

Add a new admin section:

```txt
Pages
```

Subsections:

```txt
Pages
Docs
Tutorials
FAQ
Roadmap
Changelog
Navigation
Redirects
Settings
```

Admin features:

```txt
create/edit/delete content
set status: draft/published/archived
edit slug/path
edit SEO fields
edit navigation
preview route path
import Markdown
export public site
```

MVP can be simple forms and textareas. Avoid a complex visual builder.

---

## Markdown Import

Support folder-based Markdown import for docs-style content.

Example folder:

```txt
content/
├── pages/
│   ├── index.md
│   ├── what-is-postsnail.md
│   └── roadmap.md
├── docs/
│   ├── protocol.md
│   └── workspace-vault.md
├── tutorials/
│   └── first-blog.md
└── changelog/
    └── 0.1.0.md
```

Markdown frontmatter example:

```md
---
title: "What Is PostSnail?"
slug: "what-is-postsnail"
type: "page"
status: "published"
excerpt: "A short introduction to PostSnail."
tags:
  - postsnail
  - open-web
seo:
  title: "What Is PostSnail?"
  description: "Learn how PostSnail works."
---

Page body here.
```

CLI-compatible import command later:

```bash
postsnail pages import content/
```

---

## Routes

The plugin should generate static routes.

Examples:

```txt
/
/about/
/docs/
/docs/protocol/
/docs/workspace-vault/
/tutorials/
/tutorials/first-blog/
/roadmap/
/changelog/
/faq/
```

Routes should be added through the plugin export hook:

```txt
export:routes
```

---

## Navigation

Support a navigation model:

```json
[
  {
    "label": "Home",
    "url": "/"
  },
  {
    "label": "Docs",
    "url": "/docs/"
  },
  {
    "label": "Tutorials",
    "url": "/tutorials/"
  },
  {
    "label": "Roadmap",
    "url": "/roadmap/"
  }
]
```

Navigation must be exported as:

```txt
HTML navigation
optional navigation.json
```

---

## Theme Integration

PostSnail Pages must use the theme system.

Required template slots:

```txt
siteHeader
siteNav
pageHeader
pageBody
pageFooter
docsSidebar
tutorialSteps
roadmapList
changelogList
faqList
siteFooter
```

Default templates should exist if no custom theme supports Pages.

The plugin must not load runtime JavaScript by default.

---

## SEO Requirements

Every generated page should include:

```txt
title tag
meta description
canonical URL
Open Graph title
Open Graph description
Open Graph type
Open Graph URL
Open Graph image if available
Twitter card
JSON-LD where useful
sitemap entry
```

Docs/tutorial pages should be clean, readable, and fast.

---

## Export Output

The public ZIP may include:

```txt
HTML pages
CSS/theme assets
navigation.json
sitemap.xml updates
feed updates if useful
public docs/tutorials/roadmap/changelog JSON if useful
```

The public ZIP must not include:

```txt
draft pages
archived private content
admin-only notes
private plugin state
workspace data
.env
tokens
private comments
```

---

## Manifest Integration

Add plugin output metadata to `postsnail.manifest.json`:

```json
{
  "extensions": {
    "plugins": {
      "postsnail-pages": {
        "version": "0.1.0",
        "contentTypes": [
          "page",
          "doc",
          "tutorial",
          "faq",
          "roadmap",
          "changelog"
        ],
        "routes": [
          "/",
          "/docs/",
          "/tutorials/"
        ]
      }
    }
  }
}
```

---

## Feed Integration

MVP:

```txt
blog posts remain in normal feeds
changelog can optionally produce /changelog/feed.json
tutorials can optionally appear in main feed
docs should not appear in main feed by default
```

---

## Redirects

Support static redirect metadata for providers that allow it.

Examples:

```txt
_redirects for Netlify-style systems
Cloudflare Pages _redirects
```

Each redirect:

```json
{
  "from": "/old-path/",
  "to": "/new-path/",
  "status": 301
}
```

---

## Plugin Manifest

Create the plugin manifest:

```json
{
  "protocol": "postsnail-plugin-v1",
  "id": "postsnail-pages",
  "name": "PostSnail Pages",
  "version": "0.1.0",
  "description": "Official CMS plugin for pages, docs, tutorials, roadmap, FAQ, and changelog.",
  "type": "official",
  "capabilities": [
    "contentTypes",
    "adminPanel",
    "exportRoutes",
    "exportSitemap",
    "exportFeeds",
    "storePluginState",
    "themeSlots"
  ],
  "permissions": [
    "read:posts",
    "read:assets",
    "write:pluginState",
    "export:routes",
    "export:sitemap",
    "export:feeds",
    "export:manifestExtensions"
  ],
  "admin": {
    "entry": "admin/plugin.js",
    "loadWhen": ["admin:pages"]
  },
  "export": {
    "hooks": [
      "export:routes",
      "export:sitemap",
      "export:feeds",
      "export:manifestExtensions"
    ]
  },
  "runtime": {
    "entry": "",
    "css": [],
    "loadWhen": []
  },
  "state": {
    "schemaVersion": 1
  }
}
```

---

## Code Structure

Suggested files:

```txt
plugins/postsnail-pages/
├── plugin.json
├── admin/
│   └── plugin.js
├── export/
│   ├── routes.js
│   ├── sitemap.js
│   ├── feeds.js
│   └── manifestExtensions.js
├── schema/
│   ├── page.js
│   ├── doc.js
│   ├── tutorial.js
│   ├── faq.js
│   ├── roadmap.js
│   └── changelog.js
├── templates/
│   ├── page.html
│   ├── docs-index.html
│   ├── doc.html
│   ├── tutorials-index.html
│   ├── tutorial.html
│   ├── roadmap.html
│   ├── changelog.html
│   └── faq.html
├── migrations/
│   └── index.js
└── README.md
```

If plugin system is not fully implemented yet, scaffold the plugin in a way that can be wired into the current exporter safely.

---

## Docs

Create/update:

```txt
docs/postsnail-pages.md
docs/pages-plugin.md
docs/cms-mode.md
docs/markdown-import.md
docs/navigation.md
docs/official-site-workflow.md
docs/plugin-system.md
docs/theme-system.md
README.md
```

Docs must explain:

```txt
PostSnail Pages is an official plugin, not core.
.postsnail remains the encrypted CMS vault.
Published ZIP is only public output.
Pages plugin is for full websites and docs.
PostSnail Core stays tiny.
Themes control appearance.
Plugins add behavior.
```

---

## Tests

Add tests for:

```txt
page schema validation
doc schema validation
tutorial schema validation
draft content not exported
published content exported
navigation export
sitemap integration
manifest extension output
Markdown frontmatter import
route generation
SEO metadata generation
redirect generation
theme template fallback
plugin state stored in workspace
plugin state migration preserves unknown fields
public ZIP excludes drafts/private plugin state
legacy workspace without pages still opens
```

---

## Manual Test

1. Create or open a `.postsnail` workspace.
2. Enable PostSnail Pages.
3. Create homepage page.
4. Create docs page.
5. Create tutorial.
6. Create FAQ item.
7. Create roadmap item.
8. Create changelog entry.
9. Configure navigation.
10. Export public site.
11. Confirm generated routes exist.
12. Confirm sitemap includes public pages.
13. Confirm drafts are not exported.
14. Verify manifest and proof files.
15. Deploy with SnailLift if available.
16. Verify live site.

---

## Acceptance Criteria

Done when:

1. PostSnail Pages plugin exists.
2. It adds pages/docs/tutorials/FAQ/roadmap/changelog content structures.
3. It stores state in `.postsnail` workspace.
4. It generates static routes.
5. It exports only published content.
6. It integrates with navigation.
7. It integrates with sitemap.
8. It integrates with themes/template slots.
9. It adds manifest extension metadata.
10. It does not load public runtime JS by default.
11. It keeps PostSnail Core small.
12. Docs explain CMS mode clearly.
13. Tests cover route generation, export safety, and plugin state.

---

## Future Ideas

Later versions can add:

```txt
visual landing page builder
custom content types
docs sidebar ordering
versioned docs
translation/i18n
search index
forms plugin integration
content collections
preview mode
Aurel draft queue integration
Canopy dashboard integration
```

---

## Strategic Note

This plugin proves that PostSnail can be more than a microblog without becoming bloated.

It should be powerful enough for `postsnail.org`, but small enough for normal creators to ignore if they only want a simple microblog.

---

## Final Ecosystem Sentence

```txt
PostSnail Core opens the shell and signs the trail.
PostSnail Pages turns the shell into a tiny CMS.
Themes shape the pages.
SnailLift publishes the trail.
Forest helps people find it.
```
