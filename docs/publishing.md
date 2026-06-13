# Publishing PostSnail

PostSnail has two publishing paths.

## Publish To Surge

SnailLift can publish directly through the local Surge bridge after a one-time setup in the admin. The creator enters the site URL, domain, project folder, Surge login, and a limited token.

The credentials stay inside the encrypted Shell. They are never written to the public Website ZIP, localStorage, or tracker payloads.

The direct publish flow:

1. Build the public files.
2. Run the local safety checks.
3. Upload through the local Surge bridge.
4. Verify the live manifest and `.well-known` files.
5. Notify Forest only after verification passes.

## Download ZIP

Download ZIP remains the fallback. It is the universal public static artifact and works on any static host.

The ZIP is public. It is not the full project source and must not contain the private `.postsnail` Shell.

## SnailLift

SnailLift prepares a safe public bundle, helps deploy it, verifies the live proof files, and then notifies Forest.

SnailLift is optional. It is a deployment assistant, not hosting.

Alpha 2 uses Surge as the publish path. The creator still controls the hosting account and runs the helper locally.

## Forest

Forest should be notified only after the new public ZIP contents are live and live verification passes. This keeps search updates tied to the actual deployed fingerprint.
