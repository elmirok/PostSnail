# Publish On Surge

PostSnail exports plain static files, so Surge can host the microblog without a server bill.

Do not upload your encrypted `.postsnail` workspace to Surge. The workspace is your private editable source. The Website ZIP is the public publishing output.

## Flow

1. Save your Shell.
2. Export `Website ZIP`.
3. Start the local bridge with `npm run surge:bridge`.
4. Click `Publish to Surge` from the SnailLift panel.
5. Open the deployed `.well-known/postsnail.json` and `postsnail.manifest.json` URLs in the browser.
6. Go to [PostSnail Forest](https://forest.postsnail.org/), paste your public homepage URL, and wait for the status to move from queued to indexed.

## Notes

- The deployed root should contain `index.html`, `postsnail.manifest.json`, and `.well-known/postsnail.json`.
- PostSnail also exports a Surge `CORS` file so the admin verifier can fetch the public proof files cross-origin.
- PostSnail exports a root `.surgeignore` that keeps `.postsnail` Shell files, passphrase text files, `.env` files, and similar secrets out of direct Surge uploads. Keep it in the folder if you unzip the Website ZIP manually.
- Forest indexes summaries only, not full post bodies.
