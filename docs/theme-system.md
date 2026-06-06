# PostSnail Theme System

Themes change presentation while Core keeps proof, workspace, and export rules stable.

## Theme Types

PostSnail recognizes two foundation theme manifest types:

- `postsnail-frontend-theme` for generated public sites.
- `postsnail-admin-theme` for admin visual tokens.

## Frontend Themes

Frontend themes declare templates and public assets for generated pages:

```json
{
  "type": "postsnail-frontend-theme",
  "id": "quiet-feed",
  "name": "Quiet Feed",
  "version": "1.0.0",
  "templates": {
    "home": "templates/home.html",
    "post": "templates/post.html",
    "archive": "templates/archive.html",
    "tag": "templates/tag.html"
  },
  "assets": {
    "css": ["assets/theme.css"],
    "js": []
  }
}
```

PostSnail Pages 1A uses the current built-in public shell and template slots for page and docs routes. Future Pages sprints can deepen theme template support without moving CMS state into Core.

## Admin Themes

Admin themes are intentionally narrower. They may declare design tokens only:

```json
{
  "type": "postsnail-admin-theme",
  "id": "shell-coral",
  "name": "Shell Coral",
  "version": "1.0.0",
  "tokens": {
    "--ps-bg": "#fffdf7",
    "--ps-text": "#080a2f",
    "--ps-brand": "#ef4056"
  }
}
```

Admin themes must not declare JavaScript runtime assets. This keeps the local-first admin from becoming an arbitrary code-loading surface.

## Compatibility

Theme manifests follow the same required/optional feature model as protocol files. Unknown optional theme data is ignored safely. Unknown required theme features fail clearly.

## Current Core APIs

`createThemeRegistry(manifests)` registers validated frontend and admin theme manifests.

`resolveFrontendTheme(appearance, registry)` falls back to the built-in `quiet-feed` theme so old Shells keep exporting the current public style.

`resolveAdminThemeTokens(appearance, registry)` returns CSS variables only. Alpha 1 admin themes do not run JavaScript.

Theme selection lives in the encrypted Shell under `appearance`, with `frontendTheme`, `adminTheme`, and `themeSettings`.
