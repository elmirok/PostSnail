# PostSnail Extension Security

PostSnail extensions add power without owning the Shell, slowing every public page, or weakening the proof boundary.

```txt
Install does not mean load.
Enable does not mean load everywhere.
Routes decide what assets load.
```

## Security Boundaries

- Plugin manifests are validated before they can be installed or enabled.
- Hook planning is declarative and deterministic; Alpha 1 does not execute arbitrary plugin code.
- Runtime assets must be scoped to matching routes.
- Private plugin state stays inside the encrypted Shell.
- Public plugin/theme output must pass public export safety checks.
- Unknown optional fields are ignored safely.
- Unknown required features fail clearly.

## Out Of Scope For Alpha 1

Third-party package installation, plugin ZIP loading, marketplaces, remote plugin code, and SnailLift-as-plugin are future work. They should only ship after the PSEP and compatibility rules are strong enough for creators to review extension risk.
