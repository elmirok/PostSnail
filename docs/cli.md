# PostSnail CLI

PostSnail CLI is the trusted local automation interface for PostSnail.

It keeps the same core rules as the browser admin:

- `.postsnail` is the private encrypted editable Shell.
- `.zip` is the public signed Website artifact.
- The Shell passphrase opens the workspace.
- The identity passphrase unlocks the signing key for `build` and `zip`.

The CLI exposes direct commands for trusted local automation with flags and environment variables where practical.

Core commands:

- `postsnail workspace create|info|migrate`
- `postsnail profile show|set`
- `postsnail identity generate|show`
- `postsnail plugin list|enable|disable`
- `postsnail post list|new|import|status|delete`
- `postsnail page list|import|status|delete|navigation`
- `postsnail asset list|unused|delete-unused`
- `postsnail comment verify|approve|reject|list|block-key`
- `postsnail build`
- `postsnail zip`
- `postsnail verify`
- `postsnail live verify`
- `postsnail publish surge`
- `postsnail forest announce`
- `postsnail shellname register|update|renew`
- `postsnail domain move|mirror`

Secrets stay local:

- Shell passphrases and identity passphrases are accepted as command inputs or environment variables for trusted local automation.
- Forest, ShellName, and domain-move commands send only signed public records, never raw private keys or `.postsnail` vault data.

There is no bundled local Forest server. Forest commands talk to a configured remote Forest API.
