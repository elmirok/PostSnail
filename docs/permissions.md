# PostSnail Permission Model

Plugin permissions are explicit strings validated before a plugin can be treated as compatible.

## Plugin Permissions

Alpha 1 recognizes:

- `read:posts`
- `write:posts`
- `read:pages`
- `write:pages`
- `read:assets`
- `write:assets`
- `read:profile`
- `write:profile`
- `read:manifest`
- `write:manifestExtensions`
- `read:pluginState`
- `write:pluginState`
- `export:routes`
- `export:assets`
- `export:sitemap`
- `export:feeds`
- `fetch:trackers`
- `fetch:external`
- `deploy:provider`

Unknown permissions fail validation.

## Sensitive Permissions

These permissions require extra creator review because they can change public output, touch external services, or affect the site identity surface:

- `write:posts`
- `write:profile`
- `write:manifestExtensions`
- `fetch:external`
- `deploy:provider`

## Boundary Rules

- Permissions describe intent; they do not grant automatic runtime execution.
- Private plugin state remains in the encrypted Shell.
- Public plugin assets must still pass route asset declarations and public export safety checks.
- Future permissions that change proof semantics should go through a PSEP.
- Permissions describe what a plugin may ask for; they do not grant automatic execution or access to private identity keys.
