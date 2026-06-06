# ShellNames Security

ShellNames improve readability, not authority.

## What ShellNames Prove

A valid ShellName proves that the public key named in the record signed that record. Forest also checks that the name is available, not reserved, and not hidden or expired before showing it in search.

## What ShellNames Do Not Prove

ShellNames do not prove:

- legal identity
- domain ownership
- factual truth
- platform endorsement
- account ownership
- control of a GitHub, Cloudflare, email, or social account

## Private Key Safety

The admin signs ShellName records locally with the unlocked publisher key. The request to Forest contains only public metadata and a signature. It must never contain the raw private signing key, encrypted Shell vault, drafts, private plugin state, rejected comments, or passphrases.

## Abuse Controls

Alpha 1 Forest uses reserved names, duplicate checks, one active ShellName per public key, IP and public-key rate limits, expiry, renewal, and admin hide/unhide moderation.

These controls are intentionally simple. They reduce cost and obvious abuse but do not solve impersonation disputes or global naming governance.
