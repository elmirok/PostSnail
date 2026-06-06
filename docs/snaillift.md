# SnailLift

SnailLift is the PostSnail deployment assistant.

It is not hosting. It does not own the creator account, source, key, or domain. It helps a creator move the public signed trail to a hosting provider the creator controls.

For Alpha 1, SnailLift is a built-in official deployment module. It stays isolated under `src/snaillift/`: provider-specific deployment code must not live in PostSnail Core exporter, workspace, identity, manifest, protocol, or signing modules. This boundary is intentional so the module can later move to `plugins/postsnail-snaillift` with minimal refactor when Plugin System Core is ready.

Product sentence:

```txt
Your shell stays private. Your trail goes live.
```

## Flow

1. Export Website ZIP.
2. Run the SnailLift safety check.
3. Deploy only public static files.
4. Verify the live PostSnail proof files.
5. Notify Forest only after live verification passes.

## Boundaries

SnailLift must never upload `.postsnail` Shell vaults, drafts, private keys, rejected comments, private plugin state, recovery data, or environment files.

Core owns public export, workspace, identity, proof, and migration rules. SnailLift consumes those public interfaces and adds deployment assistance around them.

Download ZIP remains the universal fallback. SnailLift is optional.
