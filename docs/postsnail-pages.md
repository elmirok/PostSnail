# PostSnail Pages

PostSnail Pages is the official bundled CMS plugin for Alpha 2.

It lets a private encrypted `.postsnail` Shell manage static pages, docs, navigation, and basic SEO fields without turning PostSnail Core into a CMS.

## What It Adds

- A gated `Pages` admin tab after enabling `postsnail-pages` in Extensions.
- Published static pages with custom paths.
- Published docs at `/docs/` and `/docs/<slug>/`.
- Navigation items exported into generated pages.
- Basic SEO title, description, and noindex fields.
- Optional homepage override: a published page at `/` replaces the blog homepage, and the microblog feed moves to `/blog/`.

## What Stays Private

Pages plugin state lives in the encrypted Shell under `plugins.state["postsnail-pages"]`.

Draft pages, archived pages, draft docs, archived docs, private plugin state, and unknown future fields stay in the `.postsnail` Shell. They must not be included in the public Website ZIP.

## What Gets Published

The public Website ZIP may include:

- Published page HTML routes.
- Published docs routes.
- Sitemap entries for published Pages routes.
- Manifest extension metadata listing the Pages plugin version, content types, and exported routes.

The ZIP is still public output only. It is not the full editable project source.

## Alpha 2 Limits

This sprint does not include tutorials, FAQ, roadmap, changelog, redirects, Markdown frontmatter import, visual page building, third-party plugin loading, or a plugin marketplace.

Those can be added as later Pages plugin sprints without changing the private Shell/public ZIP boundary.
