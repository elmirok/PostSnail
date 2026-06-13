# PostSnail Route Assets

Public runtime assets must be declared per route, not globally.

## Why

PostSnail generated sites should stay small, static, and easy to inspect. A plugin or theme install should not make every page load JavaScript or CSS. Route-level declarations make asset loading explicit.

## Route Map Shape

`createRouteAssetMap(routes)` turns route declarations into a normalized map:

```json
{
  "/posts/hello/": {
    "route": "/posts/hello/",
    "type": "post",
    "template": "post",
    "theme": "quiet-feed",
    "plugins": ["postsnail-comments"],
    "assets": ["/assets/theme.css", "/plugins/comments.js"]
  }
}
```

## Rules

- Assets are declared per route.
- Duplicate route assets are removed for that route.
- Assets from one route do not leak into another route.
- Asset paths must be public absolute paths like `/assets/theme.css`.
- Asset paths must not contain `..`, protocols, or unsafe path syntax.

`resolveRouteAssets(route, theme, enabledPlugins)` combines the active theme assets with enabled plugin runtime declarations only when the route matches `loadWhen`.

PostSnail Pages adds page and docs routes to this map, but Alpha 2 does not add public runtime JavaScript by default.

This keeps plugin and theme runtime behavior inspectable before static export. The generated manifest may include optional `extensions.routeAssets` metadata so verifiers and future tools can see which routes planned which public assets.
