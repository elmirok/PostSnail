# PostSnail Workspace Vault

PostSnail has two exports:

1. Encrypted Workspace (`.postsnail`) for the creator.
2. Public Website ZIP (`.zip`) for publishing.

The `.postsnail` file is the private editable source for a microblog. It is encrypted with a workspace passphrase and should stay with the creator. The Website ZIP is public static output for Cloudflare Pages or another static host. It is not the full project source.

## What The Workspace Contains

The encrypted workspace payload contains profile data, posts, drafts, images/assets, the identity object with encrypted private signing key material, settings, commit history, plugin lock data, plugin private state, approved comments, rejected comments, blocked public keys, tracker URLs, and export history when available.

It must never contain raw private signing keys.

## What The Public ZIP Contains

The public Website ZIP contains published pages, public assets, feeds, sitemap, public proof files, manifests, static runtime plugin files, and approved public comments when supported. Drafts, rejected comments, private plugin state, moderation notes, recovery data, raw private keys, and the `.postsnail` workspace are not public ZIP content.

## Moving Computers

1. Export Workspace from the old browser.
2. Move the `.postsnail` file privately.
3. Open PostSnail on the new computer.
4. Import Workspace with the workspace passphrase.
5. Unlock the publisher key with its identity passphrase.
6. Export a new public Website ZIP when ready.

## Legacy JSON Backups

Old JSON backups remain importable through `Import Legacy Backup JSON`. PostSnail validates the backup, rejects raw private keys, converts it into the v1 workspace schema, restores the editable state, and downloads a new encrypted `.postsnail` file.

## Public Recovery Later

Importing `.postsnail` restores the real project. Importing a public ZIP or public site later can only recover public content. Public recovery cannot restore private keys, drafts, private plugin state, rejected comments, moderation notes, or recovery data.
