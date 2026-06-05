# Publish PostSnail on Cloudflare Pages

PostSnail exports a public Website ZIP of plain static files. Cloudflare Pages can host those files for free without a backend.

Do not upload your encrypted `.postsnail` workspace to Cloudflare Pages. The workspace is your private editable source. The Website ZIP is the public publishing output.

## Upload Through the Dashboard

1. In PostSnail, click `Export Workspace` and keep the `.postsnail` file private.
2. Unlock your publisher key and click `Export Website ZIP`.
3. Unzip the Website ZIP on your computer.
4. In Cloudflare, create a Pages project.
5. Choose the direct upload option.
6. Upload the unzipped Website ZIP contents, not the `.postsnail` workspace and not the ZIP file itself.
7. After deploy, open your site and check:
   - `/postsnail.manifest.json`
   - `/.well-known/postsnail.json`
   - `/.well-known/postsnail/latest-commit.json`
   - `/.well-known/postsnail/commits.json`
   - `/feed.json`
   - `/rss.xml`
   - `/sitemap.xml`

## Verify Before and After Publishing

Before publishing, use PostSnail’s Verify tab and choose the Website ZIP. After publishing, download the deployed files or keep the original ZIP and verify it again before sharing the fingerprint.

## Security Headers

The generated microblog is static HTML with inline page CSS. If you add custom Cloudflare headers later, keep them compatible with static HTML and image assets. Do not add analytics or remote scripts unless you are comfortable changing the privacy story.
