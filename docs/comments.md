# PostSnail Comments

PostSnail Comments is the official bundled plugin for approved static replies and private Shell moderation.

It follows the same boundary as the rest of PostSnail:

- `.postsnail` is the private editable Shell.
- `.zip` is the public Website ZIP.
- Approved comments may become public.
- Rejected comments and blocked author keys stay private in the Shell.

## What It Adds

- A `Comments` tab in the admin after enabling `postsnail-comments` from Extensions.
- Shell-private storage for tracker URLs, approved comments, rejected comments, and blocked author keys.
- Public comments runtime files only on post routes.
- `approved-comments.json` in the public ZIP when the plugin is enabled.

## Current Alpha Scope

Alpha 2 Comments focuses on approved static replies and local moderation boundaries.

- Approved comments are exported publicly.
- Rejected comments stay private.
- Tracker URLs can be stored as public metadata for future live reply discovery.
- Comments stays outside PostSnail Core.

## Security Boundary

Comment packets should be verified locally before approval.

PostSnail must never publish:

- rejected comments
- blocked author keys
- moderation notes
- private plugin state
- `.postsnail` Shell data

Comments is an extension, not a reason to weaken the proof boundary.
