import { zipSync, strToU8 } from "../vendor/fflate/browser.js";
import { canonicalJson } from "./canonical.js";
import { buildExcerpt, slugify } from "./content.js";
import { decodeBase64, encodeBase64, encodeText } from "./bytes.js";
import {
  buildAnnouncePayload,
  buildCommitLog,
  buildCommitRecord,
  buildDiscovery,
  buildIdentityDocument,
  normalizeDiscoverySettings,
  normalizeSiteUrl,
  siteUrlForPath,
} from "./proof-documents.js";
import {
  DIGEST_SUITE,
  FEED_PATH,
  FINGERPRINT_SUITE,
  LATEST_COMMIT_PATH,
  MANIFEST_PATH,
  MANIFEST_VERSION,
  POSTSNAIL_PROTOCOL,
  RSS_PATH,
  SIGNATURE_SUITE,
  SITEMAP_PATH,
  WELL_KNOWN_PATH,
  COMMITS_PATH,
} from "./protocol.js";
import {
  fingerprintForBytes,
  publicKeyToText,
  sha3Hex,
  signBytes,
  signatureToText,
} from "./crypto.js";
import { renderMarkdown } from "./markdown.js";

export const GENERATOR_VERSION = "0.1.0";

export async function buildStaticExport({
  profile,
  posts,
  assets = [],
  settings = {},
  commitHistory = [],
  publicKey,
  secretKey,
  generatedAt = new Date().toISOString(),
}) {
  const cleanProfile = normalizeProfile(profile);
  const cleanSettings = normalizeDiscoverySettings(settings);
  const publishedPosts = posts
    .filter((post) => post.status === "published")
    .slice()
    .sort((a, b) => String(b.publishedAt || b.createdAt).localeCompare(String(a.publishedAt || a.createdAt)));
  const assetMap = buildAssetMap(assets);
  const publicKeyText = publicKeyToText(publicKey);
  const postProofs = publishedPosts.map((post) => {
    const record = canonicalPostRecord(post, cleanProfile, assetMap);
    const recordBytes = encodeText(canonicalJson(record));
    return {
      slug: post.slug,
      digest: sha3Hex(recordBytes),
      signature: signatureToText(signBytes(recordBytes, secretKey)),
      record,
    };
  });

  const files = {};
  files["index.html"] = htmlBytes(renderIndex(cleanProfile, publishedPosts, postProofs, assetMap));
  files["archive/index.html"] = htmlBytes(renderArchive(cleanProfile, publishedPosts));
  files["about/index.html"] = htmlBytes(renderAbout(cleanProfile));
  files["feed.json"] = htmlBytes(renderFeedJson(cleanProfile, publishedPosts, postProofs));
  files["rss.xml"] = htmlBytes(renderRss(cleanProfile, publishedPosts));
  files["sitemap.xml"] = htmlBytes(renderSitemap(cleanProfile, publishedPosts));
  for (const post of publishedPosts) {
    files[`posts/${post.slug}/index.html`] = htmlBytes(renderPost(cleanProfile, post, postProofs, assetMap));
  }
  for (const tag of tagsForPosts(publishedPosts)) {
    files[`tags/${tag}/index.html`] = htmlBytes(renderTag(cleanProfile, tag, publishedPosts));
  }
  for (const asset of assetMap.values()) {
    files[`assets/${asset.fileName}`] = decodeBase64(asset.dataBase64);
  }

  const fileDigests = digestFiles(files);
  const bundleFingerprint = fingerprintForBytes(encodeText(canonicalJson({ files: fileDigests, posts: postProofs })));
  const manifestPayload = {
    manifestVersion: MANIFEST_VERSION,
    generator: { name: "PostSnail", version: GENERATOR_VERSION },
    generatedAt,
    site: cleanProfile,
    discovery: buildDiscovery(cleanProfile, cleanSettings),
    algorithm: {
      digest: DIGEST_SUITE,
      signature: SIGNATURE_SUITE,
      fingerprint: FINGERPRINT_SUITE,
    },
    publicKey: publicKeyText,
    posts: postProofs,
    files: fileDigests,
    bundleFingerprint,
  };
  const manifestSignature = signatureToText(signBytes(encodeText(canonicalJson(manifestPayload)), secretKey));
  const manifest = { ...manifestPayload, manifestSignature };
  const identity = buildIdentityDocument({
    profile: cleanProfile,
    settings: cleanSettings,
    publicKey: publicKeyText,
    bundleFingerprint,
    generatedAt,
    secretKey,
  });
  const latestCommit = buildCommitRecord({
    commitHistory,
    manifest,
    generatedAt,
    publicKey: publicKeyText,
    secretKey,
  });
  const nextCommitHistory = [...commitHistory, latestCommit];
  const commitLog = buildCommitLog(nextCommitHistory);
  const announcePayload = buildAnnouncePayload({
    identity,
    manifest,
    publicKey: publicKeyText,
    secretKey,
    generatedAt,
  });
  files[MANIFEST_PATH] = htmlBytes(JSON.stringify(manifest, null, 2));
  files[WELL_KNOWN_PATH] = htmlBytes(JSON.stringify(identity, null, 2));
  files[LATEST_COMMIT_PATH] = htmlBytes(JSON.stringify(latestCommit, null, 2));
  files[COMMITS_PATH] = htmlBytes(JSON.stringify(commitLog, null, 2));

  return {
    filename: `postsnail-${slugify(cleanProfile.siteTitle)}.zip`,
    zipBytes: zipSync(files, { level: 9 }),
    manifest,
    wellKnown: identity,
    latestCommit,
    commitHistory: nextCommitHistory,
    announcePayload,
  };
}

function normalizeProfile(profile = {}) {
  return {
    siteTitle: String(profile.siteTitle || "Untitled Microblog").trim(),
    description: String(profile.description || "A signed static microblog.").trim(),
    handle: slugify(profile.handle || profile.siteTitle || "creator"),
    siteUrl: normalizeSiteUrl(profile.siteUrl),
    about: String(profile.about || "").trim(),
  };
}

function canonicalPostRecord(post, profile, assetMap) {
  return {
    id: post.id,
    siteHandle: profile.handle,
    title: post.title,
    slug: post.slug,
    body: post.body,
    tags: post.tags,
    excerpt: post.excerpt,
    imageFiles: post.imageIds.map((id) => assetMap.get(id)?.fileName).filter(Boolean),
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    publishedAt: post.publishedAt,
  };
}

function digestFiles(files) {
  return Object.fromEntries(
    Object.keys(files)
      .sort()
      .map((name) => [name, sha3Hex(files[name])]),
  );
}

function buildAssetMap(assets) {
  const used = new Set();
  return new Map(
    assets.map((asset, index) => {
      const extension = extensionForAsset(asset);
      const base = slugify(asset.name?.replace(/\.[^.]+$/u, "") || `image-${index + 1}`);
      let fileName = `${base}${extension}`;
      let counter = 2;
      while (used.has(fileName)) {
        fileName = `${base}-${counter}${extension}`;
        counter += 1;
      }
      used.add(fileName);
      return [asset.id, { ...asset, fileName }];
    }),
  );
}

function extensionForAsset(asset) {
  const fromName = /\.[a-z0-9]{2,5}$/iu.exec(asset.name || "")?.[0]?.toLowerCase();
  if (fromName) return fromName;
  if (asset.type === "image/jpeg") return ".jpg";
  if (asset.type === "image/webp") return ".webp";
  if (asset.type === "image/gif") return ".gif";
  return ".png";
}

function renderIndex(profile, posts, proofs, assetMap) {
  return renderPage(profile, {
    title: profile.siteTitle,
    path: "",
    body: `
      <section class="hero">
        <p class="kicker">@${escapeHtml(profile.handle)}</p>
        <h1>${escapeHtml(profile.siteTitle)}</h1>
        <p>${escapeHtml(profile.description)}</p>
      </section>
      <section class="feed">
        ${posts.map((post) => renderPostCard(post, proofs, assetMap)).join("") || "<p>No posts yet.</p>"}
      </section>
    `,
  });
}

function renderArchive(profile, posts) {
  return renderPage(profile, {
    title: `Archive - ${profile.siteTitle}`,
    path: "archive/",
    body: `
      <h1>Archive</h1>
      <ol class="archive-list">
        ${posts.map((post) => `<li><a href="../posts/${post.slug}/">${escapeHtml(post.title || post.slug)}</a><time>${formatDate(post.publishedAt)}</time></li>`).join("")}
      </ol>
    `,
    rootPrefix: "../",
  });
}

function renderAbout(profile) {
  const body = profile.about ? renderMarkdown(profile.about) : `<p>${escapeHtml(profile.description)}</p>`;
  return renderPage(profile, {
    title: `About - ${profile.siteTitle}`,
    path: "about/",
    body: `<h1>About</h1>${body}`,
    rootPrefix: "../",
  });
}

function renderPost(profile, post, proofs, assetMap) {
  const proof = proofs.find((item) => item.slug === post.slug);
  const images = post.imageIds
    .map((id) => assetMap.get(id))
    .filter(Boolean)
    .map((asset) => `<img src="../../assets/${asset.fileName}" alt="${escapeHtml(asset.alt || asset.name || "")}" loading="lazy">`)
    .join("");
  return renderPage(profile, {
    title: `${post.title || post.slug} - ${profile.siteTitle}`,
    path: `posts/${post.slug}/`,
    type: "article",
    post,
    body: `
      <article class="post-full">
        <p class="kicker">${formatDate(post.publishedAt)}</p>
        <h1>${escapeHtml(post.title || post.slug)}</h1>
        <div class="post-tags">${post.tags.map((tag) => `<a href="../../tags/${tag}/">#${escapeHtml(tag)}</a>`).join("")}</div>
        <div class="post-images">${images}</div>
        <div class="markdown">${renderMarkdown(post.body)}</div>
        <p class="proof">Post digest <code>${escapeHtml(proof?.digest || "")}</code></p>
      </article>
    `,
    rootPrefix: "../../",
  });
}

function renderTag(profile, tag, posts) {
  const tagged = posts.filter((post) => post.tags.includes(tag));
  return renderPage(profile, {
    title: `#${tag} - ${profile.siteTitle}`,
    path: `tags/${tag}/`,
    body: `<h1>#${escapeHtml(tag)}</h1><section class="feed">${tagged.map((post) => renderPostCard(post, [], new Map(), "../../")).join("")}</section>`,
    rootPrefix: "../../",
  });
}

function renderPostCard(post, proofs, assetMap, rootPrefix = "") {
  const proof = proofs.find((item) => item.slug === post.slug);
  const firstImage = post.imageIds.map((id) => assetMap.get(id)).find(Boolean);
  const image = firstImage ? `<img src="${rootPrefix}assets/${firstImage.fileName}" alt="${escapeHtml(firstImage.alt || firstImage.name || "")}" loading="lazy">` : "";
  return `
    <article class="post-card">
      ${image}
      <div>
        <time>${formatDate(post.publishedAt)}</time>
        <h2><a href="${rootPrefix}posts/${post.slug}/">${escapeHtml(post.title || post.slug)}</a></h2>
        <p>${escapeHtml(post.excerpt || buildExcerpt(post.body))}</p>
        <div class="post-tags">${post.tags.map((tag) => `<a href="${rootPrefix}tags/${tag}/">#${escapeHtml(tag)}</a>`).join("")}</div>
        ${proof ? `<code class="digest">${escapeHtml(proof.digest.slice(0, 32))}...</code>` : ""}
      </div>
    </article>
  `;
}

function renderFeedJson(profile, posts, proofs) {
  return JSON.stringify(
    {
      version: "https://jsonfeed.org/version/1.1",
      title: profile.siteTitle,
      home_page_url: profile.siteUrl || undefined,
      description: profile.description,
      items: posts.map((post) => ({
        id: post.slug,
        url: profile.siteUrl ? `${profile.siteUrl}/posts/${post.slug}/` : `posts/${post.slug}/`,
        title: post.title || post.slug,
        content_html: renderMarkdown(post.body),
        summary: post.excerpt,
        date_published: post.publishedAt,
        tags: post.tags,
        postsnail: proofs.find((proof) => proof.slug === post.slug),
      })),
    },
    null,
    2,
  );
}

function renderRss(profile, posts) {
  const siteUrl = profile.siteUrl || ".";
  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(profile.siteTitle)}</title>
    <description>${escapeXml(profile.description)}</description>
    <link>${escapeXml(siteUrl)}</link>
    ${posts
      .map(
        (post) => `<item>
      <title>${escapeXml(post.title || post.slug)}</title>
      <link>${escapeXml(`${siteUrl}/posts/${post.slug}/`)}</link>
      <guid>${escapeXml(post.slug)}</guid>
      <pubDate>${new Date(post.publishedAt || post.createdAt).toUTCString()}</pubDate>
      <description>${escapeXml(post.excerpt)}</description>
    </item>`,
      )
      .join("\n")}
  </channel>
</rss>`;
}

function renderSitemap(profile, posts) {
  const urls = [
    ["", latestPostDate(posts)],
    ["archive/", latestPostDate(posts)],
    ["about/", ""],
    [FEED_PATH, latestPostDate(posts)],
    [RSS_PATH, latestPostDate(posts)],
    ...posts.map((post) => [`posts/${post.slug}/`, post.updatedAt || post.publishedAt || post.createdAt]),
    ...tagsForPosts(posts).map((tag) => [`tags/${tag}/`, latestPostDate(posts.filter((post) => post.tags.includes(tag)))]),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(([path, updatedAt]) => `  <url>
    <loc>${escapeXml(siteUrlForPath(profile.siteUrl, path))}</loc>
    ${updatedAt ? `<lastmod>${escapeXml(new Date(updatedAt).toISOString())}</lastmod>` : ""}
  </url>`)
  .join("\n")}
</urlset>`;
}

function renderPage(profile, { title, body, rootPrefix = "", path = "", type = "website", post = null }) {
  const canonicalUrl = siteUrlForPath(profile.siteUrl, path);
  const jsonLd = post ? articleJsonLd(profile, post, canonicalUrl) : siteJsonLd(profile, canonicalUrl);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(profile.description)}">
  <link rel="canonical" href="${escapeAttr(canonicalUrl)}">
  <link rel="icon" href="data:,">
  <link rel="alternate" type="application/rss+xml" href="${rootPrefix}${RSS_PATH}">
  <link rel="alternate" type="application/feed+json" href="${rootPrefix}${FEED_PATH}">
  <link rel="alternate" type="application/postsnail+json" href="${rootPrefix}${MANIFEST_PATH}">
  <link rel="sitemap" type="application/xml" href="${rootPrefix}${SITEMAP_PATH}">
  <meta property="og:type" content="${type === "article" ? "article" : "website"}">
  <meta property="og:title" content="${escapeAttr(title)}">
  <meta property="og:description" content="${escapeAttr(post?.excerpt || profile.description)}">
  <meta property="og:url" content="${escapeAttr(canonicalUrl)}">
  <meta property="og:site_name" content="${escapeAttr(profile.siteTitle)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeAttr(title)}">
  <meta name="twitter:description" content="${escapeAttr(post?.excerpt || profile.description)}">
  ${post ? `<meta property="article:published_time" content="${escapeAttr(post.publishedAt || post.createdAt || "")}">
  <meta property="article:modified_time" content="${escapeAttr(post.updatedAt || post.publishedAt || post.createdAt || "")}">
  ${post.tags.map((tag) => `<meta property="article:tag" content="${escapeAttr(tag)}">`).join("\n  ")}` : ""}
  <script type="application/ld+json">${jsonScript(jsonLd)}</script>
  <style>${publicCss()}</style>
</head>
<body>
  <header class="site-header">
    <a href="${rootPrefix}">${escapeHtml(profile.siteTitle)}</a>
    <nav><a href="${rootPrefix}archive/">Archive</a><a href="${rootPrefix}about/">About</a></nav>
  </header>
  <main>${body}</main>
</body>
</html>`;
}

function siteJsonLd(profile, url) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: profile.siteTitle,
    description: profile.description,
    url,
  };
}

function articleJsonLd(profile, post, url) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title || post.slug,
    description: post.excerpt || buildExcerpt(post.body),
    datePublished: post.publishedAt || post.createdAt,
    dateModified: post.updatedAt || post.publishedAt || post.createdAt,
    url,
    keywords: post.tags,
    publisher: {
      "@type": "Organization",
      name: profile.siteTitle,
    },
  };
}

function publicCss() {
  return `
    :root { color: #17151f; background: #f7f7f5; font-family: Inter, Avenir Next, Segoe UI, system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f7f7f5; color: #17151f; }
    a { color: #3c1aaf; text-decoration-thickness: 0.08em; }
    .site-header { display: flex; justify-content: space-between; gap: 18px; align-items: center; width: min(980px, 92vw); margin: 0 auto; padding: 20px 0; border-bottom: 1px solid #e7e4ed; }
    .site-header > a { color: inherit; font-weight: 900; text-decoration: none; }
    nav { display: flex; gap: 14px; font-size: 0.9rem; font-weight: 750; }
    main { width: min(980px, 92vw); margin: 0 auto; padding: 34px 0 56px; }
    .hero { max-width: 720px; margin-bottom: 26px; }
    .kicker, time { color: #6c6875; font-size: 0.78rem; font-weight: 800; text-transform: uppercase; }
    h1 { font-size: clamp(2.2rem, 8vw, 4.5rem); line-height: 0.95; margin: 8px 0 12px; letter-spacing: 0; }
    h2 { margin: 0 0 8px; font-size: 1.3rem; }
    .feed { display: grid; gap: 12px; }
    .post-card { display: grid; grid-template-columns: minmax(0, 180px) minmax(0, 1fr); gap: 16px; border: 1px solid #e7e4ed; background: white; border-radius: 8px; padding: 14px; }
    .post-card img, .post-full img { width: 100%; border-radius: 8px; object-fit: cover; }
    .post-card img { aspect-ratio: 4 / 3; }
    .post-tags { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
    .digest, .proof code { overflow-wrap: anywhere; color: #6c6875; font-size: 0.78rem; }
    .post-full { max-width: 760px; }
    .markdown { font-size: 1.05rem; line-height: 1.65; }
    .archive-list { display: grid; gap: 10px; padding-left: 1.2em; }
    .archive-list li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; }
    @media (max-width: 640px) {
      .site-header, .post-card { grid-template-columns: 1fr; }
      .site-header { align-items: flex-start; flex-direction: column; }
      .post-card { display: grid; }
    }
  `;
}

function tagsForPosts(posts) {
  return Array.from(new Set(posts.flatMap((post) => post.tags))).sort();
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

function latestPostDate(posts) {
  return posts
    .map((post) => post.updatedAt || post.publishedAt || post.createdAt)
    .filter(Boolean)
    .sort()
    .at(-1) || "";
}

function htmlBytes(value) {
  return strToU8(String(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("\n", "&#10;");
}

function escapeXml(value) {
  return escapeHtml(value);
}

function jsonScript(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}
