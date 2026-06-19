# PostSnail Signature Badges

PostSnail signature badges are visual proof seals for public posts.

Each published post already has a public digest and ML-DSA-65 signature in `postsnail.manifest.json`. Alpha 2 also turns the post signature into a deterministic two-color pixel SVG badge. The badge is easier for readers to recognize than a long hash, while the real hashes and signatures remain available in the machine-readable proof files.

## What Gets Published

Generated Website ZIPs include:

- `badges/posts/<slug>.svg`
- `badges/claims/<slug>.postsnail.badge.<hash-prefix>.json`

The SVG contains the badge hash in metadata and uses only safe inline SVG. The claim JSON contains public proof data for the post, including the public key, post digest, post signature, badge hash, post URL, title, tags, excerpt, and the public canonical post record needed to verify the signature.

The public claim file never contains private keys, Shell passphrases, drafts, rejected comments, private plugin state, or `.postsnail` workspace data.

## Claiming A Badge

Readers claim a badge by clicking the badge image on a public post. That downloads a `.postsnail.badge.<hash-prefix>.json` claim file.

The reader then opens their own encrypted PostSnail Shell, enables the official PostSnail Badges plugin, and imports the claim file. The admin verifies the digest and signature locally before storing a sanitized public claim summary inside the encrypted Shell.

Public blogs never ask for a reader's `.postsnail` file or passphrase.

## Publishing A Collection

When the PostSnail Badges plugin is enabled, the reader can publish a badge collection page, normally at `/badges/`.

The page groups claims by Forest, then ShellName or source site, then by claim date and title. Badge links point to Forest resolver URLs instead of directly to the old source URL:

```txt
https://forest.postsnail.org/go/post?publicKey=...&digest=...&slug=...
```

Forest redirects only when it can find a visible indexed post with the same public key and digest. If a creator moves domains and Forest knows the signed move, the badge bookmark can resolve to the new indexed post URL.

## What Badges Prove

Badges prove that the visual seal came from a public post signature. They are a human-friendly bookmark and brand object.

Badges do not prove legal identity, factual truth, endorsement, domain ownership, or that a reader personally read the whole post. They also do not replace ZIP verification: full bundle verification still requires the complete Website ZIP.
