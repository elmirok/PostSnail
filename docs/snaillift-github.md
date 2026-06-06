# SnailLift GitHub Pages

SnailLift Sprint 1B supports GitHub Pages as a command assistant.

It does not ask for a GitHub token in the browser and does not write to GitHub from PostSnail. The creator runs local git commands after extracting the public Website ZIP.

## Steps

1. Export Website ZIP.
2. Extract the ZIP into a folder such as `postsnail-public`.
3. Prepare SnailLift GitHub settings in the admin.
4. Copy the generated commands.
5. Run the commands locally in a trusted terminal with your own git or GitHub CLI credentials.
6. Configure GitHub Pages to serve the selected branch and folder if it is not already configured.
7. Return to PostSnail and run Verify Live Site.
8. Notify Forest after verification passes.

## Safety

The generated commands only publish public ZIP contents. SnailLift must never upload the private `.postsnail` Shell, drafts, private keys, rejected comments, private plugin state, recovery data, or environment files.

GitHub Pages support uses local credentials instead of browser token storage for Alpha 1B.
