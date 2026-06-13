# ShellNames

ShellNames are Forest-scoped readable aliases for signed PostSnail Shell identities.

Example:

```txt
@elmirok@forest.postsnail.org
```

A ShellName points to a public PostSnail signing key and a public microblog URL. It is not an account, DNS name, legal identity, ownership claim, or password login. The publisher public key remains the real identity; the ShellName is only a readable discovery alias.

## Claiming A ShellName

In the admin Identity tab:

1. Create or unlock the publisher signing key.
2. Enter the Forest URL, usually `https://forest.postsnail.org`.
3. Enter a lowercase ShellName.
4. Click `Claim ShellName`.

PostSnail signs a public ShellName record locally and sends only that public record to Forest. It never sends the private key or encrypted `.postsnail` Shell.

## Updating And Renewing

The same signing key can update or renew the ShellName. Alpha 2 uses one active ShellName per public key and one-year expiry. Renew before expiry to keep the alias active in search.

## Public Export

Accepted ShellName records are stored in the encrypted `.postsnail` Shell and can appear as optional public metadata in `postsnail.manifest.json` and `.well-known/postsnail.json`.

Old verifiers ignore the optional `shellnames` feature. New verifiers must fail only if a future ShellName record declares unsupported required features.
