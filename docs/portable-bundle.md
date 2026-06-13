# PostSnail Portable Bundle - Alpha 2

PostSnail Portable is the USB-friendly bundle form of PostSnail. It keeps the browser admin local, can run a local Forest tracker for testing, keeps the bridge local when the admin is selected, and gives the creator a folder they can copy to another computer or removable drive.

## What It Does

- Asks whether to run Admin only, Forest only, or Admin + Forest.
- Launches the PostSnail admin from a local folder instead of a hosted admin.
- Starts the bridge helper locally when Admin is selected so publish workflows still work.
- Starts Forest locally when Forest is selected.
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
4. Asks what to run: Admin only, Forest only, or Admin + Forest.
5. Starts only the selected local tools.
6. Opens the browser to the selected local surface.

The public PostSnail website and documentation are included for reference, but the portable startup menu is intentionally limited to creator tooling: Admin, Forest, or both.

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

The portable bundle does not need a hosted admin to write, build, verify, notify Forest, or publish.

## Moving To Another Computer

Copy the portable folder or ZIP to the new machine, launch it again, open or import your `.postsnail` Shell, and continue working locally.

If the bundle is offline, it still opens with the bundled snapshot.
