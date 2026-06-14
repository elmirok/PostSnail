# PostSnail CLI

PostSnail CLI is the trusted local automation interface for PostSnail.

It keeps the same core rules as the browser admin:

- `.postsnail` is the private encrypted editable Shell.
- `.zip` is the public signed Website artifact.
- The Shell passphrase opens the workspace.
- The identity passphrase unlocks the signing key for `build` and `zip`.

The CLI now has two surfaces:

- `postsnail menu` opens the guided TUI Command Center used by PostSnail Portable.
- Direct commands support non-interactive local workflows with flags and environment variables where practical.

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

The Command Center shows what each workflow does, which inputs are required, the exact CLI command for learning, and the privacy boundary. Choosing `Run` asks for the needed fields and executes the workflow, so creators do not have to type flags by hand.

Secrets stay local:

- Shell passphrases and identity passphrases are accepted as command inputs or environment variables for trusted local automation.
- The portable menu may keep passphrases in process memory for one session, but never writes them to disk or logs.
- Forest, ShellName, and domain-move commands send only signed public records, never raw private keys or `.postsnail` vault data.

There is no bundled local Forest server in the portable bundle. Forest commands talk to a configured remote Forest API.
