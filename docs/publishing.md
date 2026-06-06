# Publishing PostSnail

PostSnail has two publishing paths.

## Download ZIP

Download ZIP remains the fallback. It is the universal public static artifact and works on any static host.

The ZIP is public. It is not the full project source and must not contain the private `.postsnail` Shell.

## SnailLift

SnailLift prepares a safe public bundle, helps deploy it, verifies the live proof files, and then notifies Forest.

SnailLift is optional. It is a deployment assistant, not hosting.

## Forest

Forest should be notified only after the new public ZIP contents are live and live verification passes. This keeps search updates tied to the actual deployed fingerprint.
