# SnailLift

SnailLift is the PostSnail deployment assistant.

It is not hosting. It does not own the creator account, source, key, or domain. It helps a creator move the public signed trail to a hosting provider the creator controls.

For Alpha 1, SnailLift is an official bundled plugin surfaced through the admin Extensions tab. It is still implemented as an isolated built-in deployment module under `src/snaillift/`: provider-specific deployment code must not live in PostSnail Core exporter, workspace, identity, manifest, protocol, or signing modules.

The plugin manifest id is:

```txt
postsnail-snaillift
```

Disabling the plugin hides SnailLift provider panels but does not delete deployment settings from the encrypted Shell. Download Website ZIP remains available either way.

Product sentence:

```txt
Your shell stays private. Your trail goes live.
```

## Flow

1. Export Website ZIP.
2. Run the SnailLift safety check.
3. Prepare provider commands for Cloudflare Pages or GitHub Pages.
4. Deploy only public static files from a trusted terminal.
5. Verify the live PostSnail proof files.
6. Notify Forest only after live verification passes.

## Boundaries

SnailLift must never upload `.postsnail` Shell vaults, drafts, private keys, rejected comments, private plugin state, recovery data, or environment files.

Core owns public export, workspace, identity, proof, and migration rules. SnailLift consumes those public interfaces and adds deployment assistance around them.

Download ZIP remains the universal fallback. SnailLift is optional and must be enabled before the deployment assistants appear.

Cloudflare Pages and GitHub Pages support are command assistants in Alpha 1B. PostSnail does not store provider tokens in the browser.
