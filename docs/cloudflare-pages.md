# Publish PostSnail on Cloudflare Pages

PostSnail exports plain static files. Cloudflare Pages can host them for free without a backend.

## Upload Through the Dashboard

1. In PostSnail, click `Download signed ZIP`.
2. Unzip the downloaded file on your computer.
3. In Cloudflare, create a Pages project.
4. Choose the direct upload option.
5. Upload the unzipped contents, not the ZIP file itself.
6. After deploy, open your site and check:
   - `/postsnail.manifest.json`
   - `/.well-known/postsnail.json`
   - `/feed.json`
   - `/rss.xml`

## Verify Before and After Publishing

Before publishing, use PostSnail’s Verify tab and choose the ZIP. After publishing, download the deployed files or keep the original ZIP and verify it again before sharing the fingerprint.

## Security Headers

The generated microblog is static HTML with inline page CSS. If you add custom Cloudflare headers later, keep them compatible with static HTML and image assets. Do not add analytics or remote scripts unless you are comfortable changing the privacy story.

