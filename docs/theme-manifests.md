# PostSnail Theme Manifests

Themes change presentation. They do not become plugins and they do not get private workspace access.

## Frontend Themes

Frontend themes declare templates, public assets, slots, settings, and budgets. The built-in `quiet-feed` theme represents the current generated microblog style and is the default for old Shells.

```json
{
  "protocol": "postsnail-theme-v1",
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

## Admin Themes

Admin themes are CSS-variable token sets only in Alpha 2. They must not declare JavaScript runtime assets.

Theme settings are stored in the encrypted Shell under `appearance.themeSettings`.
