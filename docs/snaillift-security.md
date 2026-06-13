# SnailLift Security

Surge credentials stay inside the encrypted Shell.

SnailLift is built in during Alpha 2, but it is not part of PostSnail Core. Provider-specific deployment logic belongs under `src/snaillift/` and must stay out of exporter, workspace, identity, manifest, protocol, and signing modules. This keeps the deployment assistant movable to `plugins/postsnail-snaillift` later.

SnailLift must never upload:

- `.postsnail` Shell vaults
- drafts
- private keys
- rejected comments
- private plugin state
- recovery data
- environment files

## Verification Gate

Live verification checks public proof files after deployment. Forest notify is gated behind successful live verification.

If the live fingerprint does not match the generated export, SnailLift must not notify Forest.

## What SnailLift Does Not Prove

SnailLift does not prove legal identity, truth, device integrity, provider account ownership, or long-term availability. It only helps deploy public static files and compare live proof metadata to the generated bundle.
