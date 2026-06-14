# PostSnail Portable Bundle - Alpha 2

PostSnail Portable is the USB-friendly bundle form of PostSnail. It opens a terminal-first Command Center, can start the local browser admin plus Surge bridge, and gives the creator a folder they can copy to another computer or removable drive.

## What It Does

- Opens the PostSnail Portable Command Center first.
- Teaches and runs supported CLI workflows from a terminal TUI, without requiring users to type full commands.
- Launches the PostSnail admin from a local folder instead of a hosted admin.
- Starts the bridge helper locally when Admin is selected so Surge publish workflows still work.
- Supports remote Forest actions through CLI/API commands, without bundling a local Forest server.
- Checks a signed release manifest on launch and stages a newer bundle when one is available and verified.
- Keeps writable runtime state inside the bundle-local `data/` directory.

## First Launch

Use the launcher entrypoint from the bundle root:

```bash
node bin/postsnail-portable.js
```

On macOS and Linux you can also use the wrapper scripts in `portable/launchers/`.

For a GitHub-hosted one-command bootstrap, use:

```bash
curl -fsSL https://raw.githubusercontent.com/elmirok/PostSnail/main/portable/bootstrap.sh | bash
```

The bootstrapper tries the latest portable ZIP from GitHub Releases first. If that asset is not published yet, it falls back to the GitHub source archive on `main`, unpacks it into a local folder, checks the host prerequisites, offers package-manager installs with permission, and then launches the bundle.
It reads prompts from your terminal, so it can still ask for permission even when invoked through `curl | bash`.

The launcher:

1. Resolves the bundle root.
2. Checks the signed release manifest.
3. Stages a newer verified release into the bundle cache when available.
4. Opens the CLI Command Center in the terminal.
5. Starts Admin + Bridge only when selected from the menu or with `--run admin`.
6. Keeps local Forest out of the portable runtime.

The public PostSnail website and documentation are included for reference, but the portable startup experience is intentionally creator-tooling first: guided CLI workflows, local Admin + Bridge, and remote Forest commands.

## Command Center

Run the default launcher:

```bash
node bin/postsnail-portable.js
```

The menu starts with:

```text
PostSnail Portable Command Center

Selected Shell: none
Admin: stopped
Bridge: stopped

1) Start local Admin + Bridge
2) Shell setup
3) Identity and profile
4) Write and manage content
5) Pages, navigation, and plugins
6) Images and cleanup
7) Build, ZIP, and verify
8) Publish with Surge
9) Forest, ShellNames, and Change Domain
10) Comments moderation
11) Learn CLI commands
0) Exit
```

Choosing an action opens a short workflow screen with `Run`, `Show command`, and `Back`. `Run` asks for the fields it needs, remembers only non-secret defaults such as the selected Shell path, and keeps passphrases in memory for the current session only.

Use direct modes when needed:

```bash
node bin/postsnail-portable.js --run cli
node bin/postsnail-portable.js --run admin
```

There is no `--forest-only` mode in Alpha 2. Forest remains the remote tracker and search surface at `https://forest.postsnail.org/`.

## Update Behavior

PostSnail Portable always falls back to the bundled snapshot if the update check is offline, missing, or fails verification.

If a newer signed release manifest is available, the launcher verifies:

- manifest signature
- release public key
- bundle version
- artifact fingerprint

Only after those checks pass does it stage the new release into the bundle-local cache.

## Writable Data

Portable writes stay inside the bundle-local `data/` directory:

- staged updates
- portable status
- logs
- bridge temporary files
- command-center preferences such as the last selected Shell path

The portable bundle does not need a hosted admin to write, build, verify, notify Forest, or publish.

## Moving To Another Computer

Copy the portable folder or ZIP to the new machine, launch it again, open or import your `.postsnail` Shell, and continue working locally.

If the bundle is offline, it still opens with the bundled snapshot.
