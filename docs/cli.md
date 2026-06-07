# PostSnail CLI

PostSnail CLI is the trusted local automation interface for PostSnail.

It keeps the same core rules as the browser admin:

- `.postsnail` is the private encrypted editable Shell.
- `.zip` is the public signed Website artifact.
- The Shell passphrase opens the workspace.
- The identity passphrase unlocks the signing key for `build` and `zip`.

CLI 1A commands:

- `postsnail workspace info`
- `postsnail workspace migrate`
- `postsnail post import`
- `postsnail build`
- `postsnail verify`
- `postsnail zip`

CLI 1A does not add deploy providers, Forest announce, or one-shot publish.

