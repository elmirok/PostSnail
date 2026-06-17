# SnailLift Surge

SnailLift is the PostSnail deployment assistant.

It is not hosting. It does not own the creator account, source, key, or domain. It helps a creator move the public signed trail to a hosting provider the creator controls.

For Alpha 2, SnailLift is an official bundled plugin surfaced through the admin Extensions tab. It is still implemented as an isolated built-in deployment module under `src/snaillift/`: provider-specific deployment code must not live in PostSnail Core exporter, workspace, identity, manifest, protocol, or signing modules.

The plugin manifest id is:

```txt
postsnail-snaillift
```

Disabling the plugin hides the Surge publish card but does not delete deployment settings from the encrypted Shell. Download Website ZIP remains available either way.

Product sentence:

```txt
Your shell stays private. Your trail goes live.
```

## Flow

1. Export Website ZIP.
2. Run the SnailLift safety check.
3. Publish through the local Surge bridge after the one-time setup.
4. Deploy only public static files from a trusted terminal or the local bridge helper. If you deploy a folder directly with Surge, keep the generated `.surgeignore` file at the root.
5. Verify the live PostSnail proof files.
6. Notify Forest only after live verification passes.

## Boundaries

SnailLift must never upload `.postsnail` Shell vaults, passphrase text files, drafts, private keys, rejected comments, private plugin state, recovery data, or environment files.

Generated Website ZIPs include a root `.surgeignore` that excludes `.postsnail`, `*.txt`, passphrase/password/secret-named files, `.env` files, and `node_modules/`, while explicitly allowing `.well-known` proof files.

Core owns public export, workspace, identity, proof, and migration rules. SnailLift consumes those public interfaces and adds deployment assistance around them.

Download ZIP remains the universal fallback. SnailLift is optional and must be enabled before the deployment assistants appear.

Surge is the only supported SnailLift publish path in this sprint. The login and token stay inside the encrypted Shell. PostSnail does not write them to the public ZIP, localStorage, or tracker payloads.
