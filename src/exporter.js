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
  POSTSNAIL_PROTOCOL_VERSION,
  REQUIRED_CORE_FEATURES,
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
import {
  badgeClaimFileName,
  badgeFileName,
  buildBadgeClaimForPost,
  buildBadgeCollectionPublicData,
  createSignatureBadge,
  forestResolverUrlForClaim,
  POSTSNAIL_BADGES_PLUGIN_ID,
} from "./badges/plugin.js";

const CORS_HEADERS = `
/postsnail.manifest.json
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, OPTIONS
  Access-Control-Allow-Headers: Content-Type

/feed.json
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, OPTIONS
  Access-Control-Allow-Headers: Content-Type

/rss.xml
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, OPTIONS
  Access-Control-Allow-Headers: Content-Type

/.well-known/postsnail.json
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, OPTIONS
  Access-Control-Allow-Headers: Content-Type

/.well-known/postsnail/latest-commit.json
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, OPTIONS
  Access-Control-Allow-Headers: Content-Type

/.well-known/postsnail/commits.json
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, OPTIONS
  Access-Control-Allow-Headers: Content-Type

/badges/claims/*
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, OPTIONS
  Access-Control-Allow-Headers: Content-Type

/badges/posts/*
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, OPTIONS
  Access-Control-Allow-Headers: Content-Type
`;

const SURGE_CORS = `*
`;

const SURGE_IGNORE = `
!.well-known
!.well-known/**
*.postsnail
*.postsnail.json
*.txt
!robots.txt
*passphrase*
*password*
*secret*
.env
.env.*
node_modules/
`;

const NETLIFY_TOML = `
[[headers]]
  for = "/postsnail.manifest.json"
  [headers.values]
    Access-Control-Allow-Origin = "*"
    Access-Control-Allow-Methods = "GET, OPTIONS"
    Access-Control-Allow-Headers = "Content-Type"

[[headers]]
  for = "/feed.json"
  [headers.values]
    Access-Control-Allow-Origin = "*"
    Access-Control-Allow-Methods = "GET, OPTIONS"
    Access-Control-Allow-Headers = "Content-Type"

[[headers]]
  for = "/rss.xml"
  [headers.values]
    Access-Control-Allow-Origin = "*"
    Access-Control-Allow-Methods = "GET, OPTIONS"
    Access-Control-Allow-Headers = "Content-Type"

[[headers]]
  for = "/.well-known/postsnail.json"
  [headers.values]
    Access-Control-Allow-Origin = "*"
    Access-Control-Allow-Methods = "GET, OPTIONS"
    Access-Control-Allow-Headers = "Content-Type"

[[headers]]
  for = "/.well-known/postsnail/latest-commit.json"
  [headers.values]
    Access-Control-Allow-Origin = "*"
    Access-Control-Allow-Methods = "GET, OPTIONS"
    Access-Control-Allow-Headers = "Content-Type"

[[headers]]
  for = "/.well-known/postsnail/commits.json"
  [headers.values]
    Access-Control-Allow-Origin = "*"
    Access-Control-Allow-Methods = "GET, OPTIONS"
    Access-Control-Allow-Headers = "Content-Type"

[[headers]]
  for = "/badges/claims/*"
  [headers.values]
    Access-Control-Allow-Origin = "*"
    Access-Control-Allow-Methods = "GET, OPTIONS"
    Access-Control-Allow-Headers = "Content-Type"

[[headers]]
  for = "/badges/posts/*"
  [headers.values]
    Access-Control-Allow-Origin = "*"
    Access-Control-Allow-Methods = "GET, OPTIONS"
    Access-Control-Allow-Headers = "Content-Type"
`;
import { validatePublicExportFiles } from "./core/export/safety.js";
import { createPluginRegistry } from "./core/plugins/pluginRegistry.js";
import { createThemeRegistry, resolveFrontendTheme } from "./core/themes/themeRegistry.js";
import { resolveRouteAssets } from "./core/assets/routeAssets.js";
import { normalizePublicFontChoice, normalizePublicTextColor, publicFontCssValue } from "./publicFonts.js";
import {
  buildCommentsPublicData,
  commentsRuntimeCss,
  commentsRuntimeScript,
  POSTSNAIL_COMMENTS_PLUGIN_ID,
} from "./comments/plugin.js";
import { buildPagesPublicData, POSTSNAIL_PAGES_PLUGIN_ID, routeToFilePath } from "./pages/plugin.js";

export const GENERATOR_VERSION = "0.2.0";
const POSTSNAIL_HOME_URL = "https://postsnail.org/";
const BRAND_ASSET_FILES = {
  logo: "postsnail-logo.png",
  icon: "postsnail-icon.png",
};
const BRAND_EXPORT_PATH = "assets/postsnail-brand/";

export async function buildStaticExport({
  profile,
  posts,
  assets = [],
  settings = {},
  commitHistory = [],
  plugins = { installed: [], lock: {}, state: {} },
  moderation = { approvedComments: [], rejectedComments: [], blockedPublicKeys: [] },
  appearance = {},
  shellNames = [],
  siteMoves = [],
  publicKey,
  secretKey,
  generatedAt = new Date().toISOString(),
}) {
  const cleanProfile = normalizeProfile(profile);
  const cleanSettings = normalizeDiscoverySettings(settings);
  const attribution = normalizeAttributionSettings(settings, cleanSettings);
  const publicShellNames = normalizeShellNames(shellNames);
  const publicSiteMoves = shouldPublishSiteMoveHistory(settings) ? normalizeSiteMoves(siteMoves) : [];
  const extensionContext = buildExtensionContext({ plugins, appearance });
  const pagesOutput = buildEnabledPagesOutput(extensionContext.enabledPlugins, plugins);
  const siteNavigation = pagesOutput?.navigation || null;
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
  const postBadges = buildPostBadgeData({
    profile: cleanProfile,
    posts: publishedPosts,
    proofs: postProofs,
    publicKeyText,
    generatedAt,
    forestUrl: preferredForestUrl(attribution, publicShellNames),
    shellName: publicShellNames[0]?.fullName || "",
  });
  const postBadgeBySlug = new Map(postBadges.map((badge) => [badge.slug, badge]));
  const commentsOutput = buildEnabledCommentsOutput(
    extensionContext.enabledPlugins,
    plugins,
    moderation,
    publicKeyText,
    secretKey,
    postProofs,
    generatedAt,
  );
  const badgesOutput = buildEnabledBadgesOutput(extensionContext.enabledPlugins, plugins);

  const files = {};
  if (pagesOutput?.usesHomepageOverride) {
    files[routeToFilePath(pagesOutput.blogIndexPath)] = htmlBytes(renderIndex(cleanProfile, publishedPosts, postProofs, assetMap, attribution, {
      title: `Blog - ${cleanProfile.siteTitle}`,
      path: pagesOutput.blogIndexPath,
      rootPrefix: rootPrefixForRoute(pagesOutput.blogIndexPath),
      navigation: siteNavigation,
    }));
  } else {
    files["index.html"] = htmlBytes(renderIndex(cleanProfile, publishedPosts, postProofs, assetMap, attribution, { navigation: siteNavigation }));
  }
  files["archive/index.html"] = htmlBytes(renderArchive(cleanProfile, publishedPosts, attribution, siteNavigation));
  files["about/index.html"] = htmlBytes(renderAbout(cleanProfile, attribution, siteNavigation));
  files["feed.json"] = htmlBytes(renderFeedJson(cleanProfile, publishedPosts, postProofs));
  files["rss.xml"] = htmlBytes(renderRss(cleanProfile, publishedPosts));
  files["sitemap.xml"] = htmlBytes(renderSitemap(
    cleanProfile,
    publishedPosts,
    attribution.trackerUrls.length > 0,
    [...pagesSitemapEntries(pagesOutput), ...badgesSitemapEntries(badgesOutput)],
  ));
  if (attribution.trackerUrls.length) {
    files["trackers/index.html"] = htmlBytes(renderTrackers(cleanProfile, attribution, siteNavigation));
  }
  for (const post of publishedPosts) {
    files[`posts/${post.slug}/index.html`] = htmlBytes(
      renderPost(cleanProfile, post, postProofs, assetMap, attribution, siteNavigation, commentsOutput, postBadgeBySlug.get(post.slug)),
    );
  }
  for (const badge of postBadges) {
    files[badge.svgPath] = htmlBytes(badge.svg);
    files[badge.claimPath] = htmlBytes(JSON.stringify(badge.claim, null, 2));
  }
  for (const tag of tagsForPosts(publishedPosts)) {
    files[`tags/${tag}/index.html`] = htmlBytes(renderTag(cleanProfile, tag, publishedPosts, attribution, siteNavigation));
  }
  if (pagesOutput) {
    for (const route of pagesOutput.routes) {
      files[route.filePath] = htmlBytes(renderPagesRoute(cleanProfile, route, pagesOutput, attribution));
    }
  }
  if (badgesOutput) {
    files[routeToFilePath(badgesOutput.pagePath)] = htmlBytes(renderBadgeCollectionPage(cleanProfile, badgesOutput, attribution, siteNavigation));
    for (const claim of badgesOutput.claims) {
      const badge = createSignatureBadge(claim.postSignature, { badgeHash: claim.badgeHash, title: claim.title });
      files[`badges/collection/${badgeFileName(claim)}.svg`] = htmlBytes(badge.svg);
    }
  }
  for (const asset of assetMap.values()) {
    files[`assets/${asset.fileName}`] = decodeBase64(asset.dataBase64);
  }
  if (attribution.showPoweredBy) {
    files[`${BRAND_EXPORT_PATH}${BRAND_ASSET_FILES.logo}`] = await loadBrandAsset(BRAND_ASSET_FILES.logo);
    files[`${BRAND_EXPORT_PATH}${BRAND_ASSET_FILES.icon}`] = await loadBrandAsset(BRAND_ASSET_FILES.icon);
  }

  files["_headers"] = htmlBytes(CORS_HEADERS.trim());
  files["CORS"] = htmlBytes(SURGE_CORS.trim());
  files["netlify.toml"] = htmlBytes(NETLIFY_TOML.trim());
  if (commentsOutput) {
    files["plugins/postsnail-comments/runtime/comments.js"] = htmlBytes(commentsRuntimeScript());
    files["plugins/postsnail-comments/runtime/comments.css"] = htmlBytes(commentsRuntimeCss());
    files["plugins/postsnail-comments/approved-comments.json"] = htmlBytes(JSON.stringify(commentsOutput.approvedExport, null, 2));
    files["plugins/postsnail-comments/plugin-manifest.json"] = htmlBytes(JSON.stringify(commentsOutput.pluginManifest, null, 2));
  }

  const fileDigests = digestFiles(files);
  const bundleFingerprint = fingerprintForBytes(encodeText(canonicalJson({ files: fileDigests, posts: postProofs })));
  const manifestExtensions = buildManifestExtensions({
    theme: extensionContext.theme,
    enabledPlugins: extensionContext.enabledPlugins,
    routeAssets: buildRouteAssetMapForExport({
      publishedPosts,
      attribution,
      theme: extensionContext.theme,
      enabledPlugins: extensionContext.enabledPlugins,
      pagesOutput,
      commentsOutput,
      badgesOutput,
    }),
    pluginMetadata: {
      ...(pagesOutput ? { [POSTSNAIL_PAGES_PLUGIN_ID]: pagesOutput.metadata } : {}),
      ...(commentsOutput
        ? {
            [POSTSNAIL_COMMENTS_PLUGIN_ID]: {
              approvedCommentCount: commentsOutput.approvedEntries.length,
              trackerUrls: commentsOutput.state.trackerUrls,
              publicFiles: commentsOutput.publicFiles,
            },
          }
        : {}),
      ...(badgesOutput
        ? {
            [POSTSNAIL_BADGES_PLUGIN_ID]: {
              claimCount: badgesOutput.claims.length,
              pagePath: badgesOutput.pagePath,
              publicFiles: badgesOutput.publicFiles,
            },
          }
        : {}),
    },
  });
  const manifestPayload = {
    protocol: POSTSNAIL_PROTOCOL,
    version: POSTSNAIL_PROTOCOL_VERSION,
    manifestVersion: MANIFEST_VERSION,
    requiredFeatures: [...REQUIRED_CORE_FEATURES],
    optionalFeatures: [
      "identity-document",
      "commit-history",
      "sitemap",
      "tracker-announce",
      "forest-tracker",
      "signature-badge",
      "themes",
      "route-assets",
      ...(commentsOutput ? ["comments"] : []),
      ...(extensionContext.enabledPlugins.length ? ["plugins"] : []),
      ...(publicShellNames.length ? ["shellnames"] : []),
      ...(publicSiteMoves.length ? ["site-moves"] : []),
    ],
    extensions: manifestExtensions,
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
    ...(publicShellNames.length ? { shellNames: publicShellNames } : {}),
    ...(publicSiteMoves.length ? { siteMoves: publicSiteMoves } : {}),
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
    shellNames: publicShellNames,
    siteMoves: publicSiteMoves,
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
  files[".surgeignore"] = htmlBytes(SURGE_IGNORE.trim());
  const exportSafety = validatePublicExportFiles(files);
  if (!exportSafety.ok) {
    throw new Error(`Public export safety check failed: ${exportSafety.errors.join("; ")}`);
  }

  return {
    filename: `postsnail-${slugify(cleanProfile.siteTitle)}.zip`,
    zipBytes: zipSync(files, { level: 9 }),
    files: cloneFiles(files),
    fileDigests,
    bundleFingerprint,
    exportSafety,
    manifest,
    wellKnown: identity,
    latestCommit,
    commitHistory: nextCommitHistory,
    announcePayload,
  };
}

function buildExtensionContext({ plugins, appearance }) {
  const registry = createPluginRegistry([], plugins);
  const themeRegistry = createThemeRegistry([]);
  return {
    pluginRegistry: registry,
    enabledPlugins: registry.listEnabled(),
    theme: resolveFrontendTheme(appearance, themeRegistry),
  };
}

function buildEnabledPagesOutput(enabledPlugins, plugins) {
  if (!enabledPlugins.some((plugin) => plugin.id === POSTSNAIL_PAGES_PLUGIN_ID)) return null;
  return buildPagesPublicData(plugins?.state?.[POSTSNAIL_PAGES_PLUGIN_ID] || {});
}

function buildEnabledCommentsOutput(enabledPlugins, plugins, moderation, publicKeyText, secretKey, postProofs, generatedAt) {
  if (!enabledPlugins.some((plugin) => plugin.id === POSTSNAIL_COMMENTS_PLUGIN_ID)) return null;
  return buildCommentsPublicData({
    pluginState: plugins?.state?.[POSTSNAIL_COMMENTS_PLUGIN_ID] || {},
    moderation,
    sitePublicKey: publicKeyText,
    secretKey,
    postProofs,
    generatedAt,
  });
}

function buildEnabledBadgesOutput(enabledPlugins, plugins) {
  if (!enabledPlugins.some((plugin) => plugin.id === POSTSNAIL_BADGES_PLUGIN_ID)) return null;
  return buildBadgeCollectionPublicData(plugins?.state?.[POSTSNAIL_BADGES_PLUGIN_ID] || {});
}

function buildPostBadgeData({ profile, posts, proofs, publicKeyText, generatedAt, forestUrl, shellName }) {
  return posts
    .map((post) => {
      const proof = proofs.find((item) => item.slug === post.slug);
      if (!proof) return null;
      const claim = buildBadgeClaimForPost({ profile, post, proof, publicKeyText, generatedAt, forestUrl, shellName });
      const badge = createSignatureBadge(proof.signature, { badgeHash: claim.badgeHash, title: post.title || post.slug });
      return {
        slug: post.slug,
        badgeHash: badge.badgeHash,
        svg: badge.svg,
        svgPath: `badges/posts/${post.slug}.svg`,
        claimPath: `badges/claims/${badgeClaimFileName(claim)}`,
        claim,
      };
    })
    .filter(Boolean);
}

function preferredForestUrl(attribution, shellNames = []) {
  const shellForest = shellNames[0]?.forest || "";
  if (shellForest) return shellForest;
  return attribution.trackerUrls.find((url) => /forest\.postsnail\.org/iu.test(url)) || attribution.trackerUrls[0] || "https://forest.postsnail.org";
}

function buildRouteAssetMapForExport({ publishedPosts, attribution, theme, enabledPlugins, pagesOutput = null, commentsOutput = null, badgesOutput = null }) {
  const routes = [
    { route: pagesOutput?.usesHomepageOverride ? pagesOutput.blogIndexPath : "/", type: "home", template: "home", features: [] },
    { route: "/archive/", type: "archive", template: "archive", features: [] },
    { route: "/about/", type: "about", template: "page", features: [] },
    ...(attribution.trackerUrls.length ? [{ route: "/trackers/", type: "trackers", template: "page", features: [] }] : []),
    ...(badgesOutput ? [{ route: badgesOutput.pagePath, type: "badges", template: "page", features: ["postsnail-badges"] }] : []),
    ...(pagesOutput?.routes || []).map((route) => ({
      route: route.route,
      type: route.type,
      template: route.type === "doc" ? "doc" : "page",
      features: ["postsnail-pages"],
    })),
    ...publishedPosts.map((post) => ({
      route: `/posts/${post.slug}/`,
      type: "post",
      template: "post",
      features: [
        ...(Array.isArray(post.features) ? post.features : []),
        ...(commentsOutput ? ["comments-enabled"] : []),
      ],
    })),
    ...tagsForPosts(publishedPosts).map((tag) => ({
      route: `/tags/${tag}/`,
      type: "tag",
      template: "tag",
      features: [],
    })),
  ];
  return Object.fromEntries(
    routes.map((route) => {
      const resolved = resolveRouteAssets(route, theme, enabledPlugins);
      return [resolved.route, resolved];
    }),
  );
}

function buildManifestExtensions({ theme, enabledPlugins, routeAssets, pluginMetadata = {} }) {
  const plugins = Object.fromEntries(
    enabledPlugins.map((plugin) => {
      const routePublicFiles = Object.values(routeAssets)
        .flatMap((route) => route.assets || [])
        .filter((assetPath) => assetPath.startsWith(`/plugins/${plugin.id}/`));
      const extraPublicFiles = Array.isArray(pluginMetadata[plugin.id]?.publicFiles) ? pluginMetadata[plugin.id].publicFiles : [];
      return [
        plugin.id,
        {
          version: plugin.version || plugin.manifest?.version || "",
          publicFiles: [...new Set([...routePublicFiles, ...extraPublicFiles])].sort(),
          ...(pluginMetadata[plugin.id] || {}),
        },
      ];
    }),
  );
  return {
    themes: {
      frontend: {
        id: theme.id,
        version: theme.version,
      },
    },
    ...(Object.keys(plugins).length ? { plugins } : {}),
    routeAssets,
  };
}

function normalizeShellNames(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item.record && typeof item.record === "object" && !Array.isArray(item.record)
        ? JSON.parse(JSON.stringify(item.record))
        : {};
      return {
        forest: String(item.forest || record.forest || "").trim(),
        name: String(item.name || record.name || "").trim().toLowerCase(),
        fullName: String(item.fullName || record.fullName || "").trim(),
        record,
      };
    })
    .filter((item) => item && item.name && item.forest && item.fullName && Object.keys(item.record).length);
}

function normalizeSiteMoves(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item.record && typeof item.record === "object" && !Array.isArray(item.record)
        ? JSON.parse(JSON.stringify(item.record))
        : {};
      return {
        id: String(item.id || "").trim(),
        status: String(item.status || record.mode || "").trim(),
        fromUrl: String(item.fromUrl || record.fromUrl || "").trim(),
        toUrl: String(item.toUrl || record.toUrl || "").trim(),
        mode: String(item.mode || record.mode || "").trim(),
        createdAt: String(item.createdAt || record.createdAt || "").trim(),
        appliedAt: String(item.appliedAt || "").trim(),
        record,
      };
    })
    .filter((item) => item && item.fromUrl && item.toUrl && item.mode && Object.keys(item.record).length);
}

function shouldPublishSiteMoveHistory(settings = {}) {
  return settings.siteMovePublishHistory === true || settings.siteMovePublishHistory === "true";
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

function normalizeAttributionSettings(settings = {}, discoverySettings = normalizeDiscoverySettings(settings)) {
  return {
    showPoweredBy: settings.showPoweredBy !== false && settings.showPoweredBy !== "false",
    showTrackerCredit: settings.showTrackerCredit !== false && settings.showTrackerCredit !== "false",
    publicFont: normalizePublicFontChoice(settings.publicFont).id,
    publicTextColor: normalizePublicTextColor(settings.publicTextColor),
    trackerUrls:
      settings.showTrackerCredit === false || settings.showTrackerCredit === "false"
        ? []
        : discoverySettings.preferredTrackers,
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

function cloneFiles(files) {
  return Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, new Uint8Array(bytes)]));
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

function renderIndex(profile, posts, proofs, assetMap, attribution, options = {}) {
  const rootPrefix = options.rootPrefix || "";
  return renderPage(profile, {
    title: options.title || profile.siteTitle,
    path: options.path || "",
    body: `
      <section class="hero">
        <p class="kicker">@${escapeHtml(profile.handle)}</p>
        <h1>${escapeHtml(profile.siteTitle)}</h1>
        <p>${escapeHtml(profile.description)}</p>
      </section>
      <section class="feed">
        ${posts.map((post) => renderPostCard(post, proofs, assetMap, rootPrefix)).join("") || "<p>No posts yet.</p>"}
      </section>
    `,
    rootPrefix,
    attribution,
    navigation: options.navigation || null,
  });
}

function renderArchive(profile, posts, attribution, navigation = null) {
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
    attribution,
    navigation,
  });
}

function renderAbout(profile, attribution, navigation = null) {
  const body = profile.about ? renderMarkdown(profile.about) : `<p>${escapeHtml(profile.description)}</p>`;
  return renderPage(profile, {
    title: `About - ${profile.siteTitle}`,
    path: "about/",
    body: `<h1>About</h1>${body}`,
    rootPrefix: "../",
    attribution,
    navigation,
  });
}

function renderPost(profile, post, proofs, assetMap, attribution, navigation = null, commentsOutput = null, badge = null) {
  const proof = proofs.find((item) => item.slug === post.slug);
  const images = post.imageIds
    .map((id) => assetMap.get(id))
    .filter(Boolean)
    .map((asset) => `<img src="../../assets/${asset.fileName}" alt="${escapeHtml(asset.alt || asset.name || "")}" loading="lazy">`)
    .join("");
  const commentsHead = commentsOutput && proof
    ? `
  <meta name="postsnail:comments-enabled" content="true">
  <meta name="postsnail:site-public-key" content="${escapeAttr(commentsOutput.approvedExport.sitePublicKey)}">
  <meta name="postsnail:post-slug" content="${escapeAttr(post.slug)}">
  <meta name="postsnail:post-digest" content="${escapeAttr(proof.digest)}">
  <meta name="postsnail:comment-trackers" content="${escapeAttr(commentsOutput.state.trackerUrls.join(","))}">
  <link rel="stylesheet" href="../../plugins/postsnail-comments/runtime/comments.css">
`
    : "";
  const commentsSection = commentsOutput && proof
    ? `
      <section id="postsnail-comments" aria-label="PostSnail comments"></section>
      <script type="module" src="../../plugins/postsnail-comments/runtime/comments.js"></script>
`
    : "";
  return renderPage(profile, {
    title: `${post.title || post.slug} - ${profile.siteTitle}`,
    path: `posts/${post.slug}/`,
    type: "article",
    post,
    head: commentsHead,
    body: `
      <article class="post-full">
        <p class="kicker">${formatDate(post.publishedAt)}</p>
        <h1>${escapeHtml(post.title || post.slug)}</h1>
        <div class="post-tags">${post.tags.map((tag) => `<a href="../../tags/${tag}/">#${escapeHtml(tag)}</a>`).join("")}</div>
        <div class="post-images">${images}</div>
        <div class="markdown">${renderMarkdown(post.body)}</div>
        ${renderSignatureBadgeProof(proof, badge)}
      </article>
      ${commentsSection}
    `,
    rootPrefix: "../../",
    attribution,
    navigation,
  });
}

function renderSignatureBadgeProof(proof, badge) {
  if (!proof) return "";
  if (!badge) {
    return `<p class="proof">Post digest <code>${escapeHtml(proof.digest || "")}</code></p>`;
  }
  return `
        <section class="signature-badge-proof" aria-label="PostSnail signature badge">
          <a class="signature-badge-link" href="../../${escapeAttr(badge.claimPath)}" download aria-label="Download badge claim">
            <img src="../../${escapeAttr(badge.svgPath)}" alt="Download badge claim" width="96" height="96" loading="lazy" data-postsnail-badge-hash="${escapeAttr(badge.badgeHash)}">
          </a>
          <div>
            <p class="kicker">Signature badge</p>
            <h2>Collect this proof seal</h2>
            <p>This two-color nature badge is generated from the signed post proof. Download the claim file and import it into your own PostSnail Shell to collect it.</p>
            <details class="proof-details">
              <summary>Show machine proof</summary>
              <p>Post digest <code>${escapeHtml(proof.digest || "")}</code></p>
              <p>Badge hash <code>${escapeHtml(badge.badgeHash || "")}</code></p>
            </details>
          </div>
        </section>
  `;
}

function renderTag(profile, tag, posts, attribution, navigation = null) {
  const tagged = posts.filter((post) => post.tags.includes(tag));
  return renderPage(profile, {
    title: `#${tag} - ${profile.siteTitle}`,
    path: `tags/${tag}/`,
    body: `<h1>#${escapeHtml(tag)}</h1><section class="feed">${tagged.map((post) => renderPostCard(post, [], new Map(), "../../")).join("")}</section>`,
    rootPrefix: "../../",
    attribution,
    navigation,
  });
}

function renderTrackers(profile, attribution, navigation = null) {
  return renderPage(profile, {
    title: `Tracker credits - ${profile.siteTitle}`,
    path: "trackers/",
    body: `
      <section class="tracker-credits">
        <p class="kicker">Discovery credits</p>
        <h1>Tracker credits</h1>
        <p>These PostSnail trackers can help readers discover this public microblog. The signed manifest on this creator-owned site remains the source of truth.</p>
        <ul class="tracker-list">
          ${attribution.trackerUrls
            .map((url) => `<li><a href="${escapeAttr(url)}" rel="noopener noreferrer">${escapeHtml(url)}</a></li>`)
            .join("")}
        </ul>
      </section>
    `,
    rootPrefix: "../",
    attribution,
    navigation,
  });
}

function renderPagesRoute(profile, route, pagesOutput, attribution) {
  const rootPrefix = rootPrefixForRoute(route.route);
  const navigation = pagesOutput.navigation;
  if (route.type === "docs-index") {
    return renderPage(profile, {
      title: `Docs - ${profile.siteTitle}`,
      path: route.route,
      description: route.seo?.description || "Documentation",
      body: `
        <section class="cms-page">
          <p class="kicker">Docs</p>
          <h1>Docs</h1>
          <div class="docs-list">
            ${(route.items || [])
              .map((doc) => `<article class="post-card"><div><h2><a href="${rootPrefix}docs/${escapeAttr(doc.slug)}/">${escapeHtml(doc.title)}</a></h2><p>${escapeHtml(doc.seo?.description || buildExcerpt(doc.body))}</p></div></article>`)
              .join("")}
          </div>
        </section>
      `,
      rootPrefix,
      attribution,
      navigation,
    });
  }

  return renderPage(profile, {
    title: `${route.seo?.title || route.title} - ${profile.siteTitle}`,
    path: route.route,
    description: route.seo?.description || route.excerpt || profile.description,
    noindex: Boolean(route.seo?.noindex),
    body: `
      <article class="cms-page">
        <p class="kicker">${route.type === "doc" ? "Doc" : "Page"}</p>
        <h1>${escapeHtml(route.title)}</h1>
        <div class="markdown">${renderMarkdown(route.body)}</div>
      </article>
    `,
    rootPrefix,
    attribution,
    navigation,
  });
}

function renderBadgeCollectionPage(profile, badgesOutput, attribution, navigation = null) {
  const rootPrefix = rootPrefixForRoute(badgesOutput.pagePath);
  const groupsHtml = badgesOutput.groups
    .map((forestGroup) => `
      <section class="badge-forest-group">
        <p class="kicker">Forest</p>
        <h2>${escapeHtml(forestGroup.forest)}</h2>
        ${forestGroup.shells.map((shellGroup) => `
          <section class="badge-shell-group">
            <h3>${escapeHtml(shellGroup.name)}</h3>
            <div class="badge-grid">
              ${shellGroup.claims.map((claim) => renderCollectedBadge(claim, rootPrefix)).join("")}
            </div>
          </section>
        `).join("")}
      </section>
    `)
    .join("");
  return renderPage(profile, {
    title: `Badge collection - ${profile.siteTitle}`,
    path: badgesOutput.pagePath,
    description: "Collected PostSnail signature badges and proof bookmarks.",
    body: `
      <section class="badge-collection">
        <p class="kicker">Collected proof seals</p>
        <h1>Badge collection</h1>
        <p>Each badge is a public bookmark to a signed post proof. Links go through Forest so a moved site can resolve to the current indexed post when Forest knows it.</p>
        ${groupsHtml || `<div class="empty-state"><span>No badges collected yet.</span><p>Import downloaded <code>.postsnail.badge.&lt;hash&gt;.json</code> claim files in the PostSnail Badges tab.</p></div>`}
      </section>
    `,
    rootPrefix,
    attribution,
    navigation,
  });
}

function renderCollectedBadge(claim, rootPrefix = "") {
  const resolverUrl = forestResolverUrlForClaim(claim);
  const imagePath = `${rootPrefix}badges/collection/${badgeFileName(claim)}.svg`;
  return `
    <article class="collected-badge">
      <a href="${escapeAttr(resolverUrl)}" rel="noopener noreferrer">
        <img src="${escapeAttr(imagePath)}" alt="${escapeAttr(claim.title || "Collected badge")}" width="72" height="72" loading="lazy" data-postsnail-badge-hash="${escapeAttr(claim.badgeHash || "")}">
      </a>
      <div>
        <h4><a href="${escapeAttr(resolverUrl)}" rel="noopener noreferrer">${escapeHtml(claim.title || claim.slug || "Untitled post")}</a></h4>
        <p>${escapeHtml(claim.excerpt || "Signed public post proof.")}</p>
        <small>${escapeHtml(claim.claimedAt || claim.publishedAt || "")}</small>
      </div>
    </article>
  `;
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

function renderSitemap(profile, posts, hasTrackerPage = false, extraEntries = []) {
  const urls = [
    ["", latestPostDate(posts)],
    ["archive/", latestPostDate(posts)],
    ["about/", ""],
    ...(hasTrackerPage ? [["trackers/", latestPostDate(posts)]] : []),
    [FEED_PATH, latestPostDate(posts)],
    [RSS_PATH, latestPostDate(posts)],
    ...extraEntries.map((entry) => [entry.path, entry.updatedAt || latestPostDate(posts)]),
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

function renderPage(profile, { title, body, rootPrefix = "", path = "", type = "website", post = null, attribution = normalizeAttributionSettings(), description = profile.description, noindex = false, navigation = null, head = "" }) {
  const canonicalUrl = siteUrlForPath(profile.siteUrl, path);
  const jsonLd = post ? articleJsonLd(profile, post, canonicalUrl) : siteJsonLd(profile, canonicalUrl);
  const footer = renderPublicFooter(rootPrefix, attribution);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  ${noindex ? `<meta name="robots" content="noindex">` : ""}
  <link rel="canonical" href="${escapeAttr(canonicalUrl)}">
  <link rel="icon" href="data:,">
  <link rel="alternate" type="application/rss+xml" href="${rootPrefix}${RSS_PATH}">
  <link rel="alternate" type="application/feed+json" href="${rootPrefix}${FEED_PATH}">
  <link rel="alternate" type="application/postsnail+json" href="${rootPrefix}${MANIFEST_PATH}">
  <link rel="sitemap" type="application/xml" href="${rootPrefix}${SITEMAP_PATH}">
  <meta property="og:type" content="${type === "article" ? "article" : "website"}">
  <meta property="og:title" content="${escapeAttr(title)}">
  <meta property="og:description" content="${escapeAttr(post?.excerpt || description)}">
  <meta property="og:url" content="${escapeAttr(canonicalUrl)}">
  <meta property="og:site_name" content="${escapeAttr(profile.siteTitle)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeAttr(title)}">
  <meta name="twitter:description" content="${escapeAttr(post?.excerpt || description)}">
  ${post ? `<meta property="article:published_time" content="${escapeAttr(post.publishedAt || post.createdAt || "")}">
  <meta property="article:modified_time" content="${escapeAttr(post.updatedAt || post.publishedAt || post.createdAt || "")}">
  ${post.tags.map((tag) => `<meta property="article:tag" content="${escapeAttr(tag)}">`).join("\n  ")}` : ""}
  ${head}
  <script type="application/ld+json">${jsonScript(jsonLd)}</script>
  <style>${publicCss(attribution)}</style>
</head>
<body>
  <header class="site-header">
    <a href="${rootPrefix}">${escapeHtml(profile.siteTitle)}</a>
    ${renderSiteNavigation(rootPrefix, navigation)}
  </header>
  <main>${body}</main>
  ${footer}
</body>
</html>`;
}

function renderPublicFooter(rootPrefix, attribution) {
  const poweredBy = attribution.showPoweredBy
    ? `<a class="powered-by" href="${POSTSNAIL_HOME_URL}" rel="noopener noreferrer"><span>Powered by PostSnail</span><img src="${rootPrefix}${BRAND_EXPORT_PATH}${BRAND_ASSET_FILES.logo}" alt="" loading="lazy"></a>`
    : "";
  const trackedBy = attribution.trackerUrls.length
    ? `<a class="tracked-by" href="${rootPrefix}trackers/">Tracked by</a>`
    : "";
  if (!poweredBy && !trackedBy) return "";
  return `
  <footer class="public-footer">
    ${poweredBy}
    ${trackedBy}
  </footer>`;
}

function renderSiteNavigation(rootPrefix, navigation = null) {
  const items = Array.isArray(navigation) && navigation.length
    ? navigation
    : [
        { label: "Archive", url: "/archive/" },
        { label: "About", url: "/about/" },
      ];
  return `<nav>${items
    .map((item) => `<a href="${escapeAttr(navigationHref(rootPrefix, item.url))}">${escapeHtml(item.label)}</a>`)
    .join("")}</nav>`;
}

function navigationHref(rootPrefix, url) {
  const value = String(url || "").trim();
  if (!value) return rootPrefix || "./";
  if (/^[a-z]+:/iu.test(value) || value.startsWith("#")) return value;
  if (!value.startsWith("/")) return value;
  return `${rootPrefix}${value.replace(/^\//u, "")}` || "./";
}

function rootPrefixForRoute(route) {
  const normalized = String(route || "/").trim();
  if (normalized === "/" || normalized === "") return "";
  const depth = normalized.replace(/^\/|\/$/gu, "").split("/").filter(Boolean).length;
  return "../".repeat(depth);
}

function pagesSitemapEntries(pagesOutput) {
  if (!pagesOutput) return [];
  return [
    ...(pagesOutput.usesHomepageOverride ? [{ path: pagesOutput.blogIndexPath }] : []),
    ...pagesOutput.routes.map((route) => ({
      path: route.route,
      updatedAt: route.item?.updatedAt || route.item?.publishedAt || "",
    })),
  ];
}

function badgesSitemapEntries(badgesOutput) {
  return badgesOutput ? [{ path: badgesOutput.pagePath }] : [];
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

function publicCss(attribution = {}) {
  const fontStack = publicFontCssValue(attribution.publicFont);
  const textColor = normalizePublicTextColor(attribution.publicTextColor);
  return `
    :root { --public-text: ${textColor}; color: var(--public-text); background: #f7f7f5; font-family: ${fontStack}; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f7f7f5; color: var(--public-text); }
    a { color: var(--public-text); text-decoration-thickness: 0.08em; }
    .site-header { display: flex; justify-content: space-between; gap: 18px; align-items: center; width: min(980px, 92vw); margin: 0 auto; padding: 20px 0; border-bottom: 1px solid #e7e4ed; }
    .site-header > a { color: inherit; font-weight: 900; text-decoration: none; }
    nav { display: flex; gap: 14px; font-size: 0.9rem; font-weight: 750; }
    main { width: min(980px, 92vw); margin: 0 auto; padding: 34px 0 56px; }
    .hero { max-width: 720px; margin-bottom: 26px; }
    .kicker, time { color: var(--public-text); opacity: 0.72; font-size: 0.78rem; font-weight: 800; text-transform: uppercase; }
    h1 { font-size: clamp(2.2rem, 8vw, 4.5rem); line-height: 0.95; margin: 8px 0 12px; letter-spacing: 0; }
    h2 { margin: 0 0 8px; font-size: 1.3rem; }
    .feed { display: grid; gap: 12px; }
    .post-card { display: grid; grid-template-columns: minmax(0, 180px) minmax(0, 1fr); gap: 16px; border: 1px solid #e7e4ed; background: white; border-radius: 8px; padding: 14px; }
    .post-card img, .post-full img { width: 100%; border-radius: 8px; object-fit: cover; }
    .post-card img { aspect-ratio: 4 / 3; }
    .post-tags { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
    .digest, .proof code { overflow-wrap: anywhere; color: var(--public-text); opacity: 0.72; font-size: 0.78rem; }
    .post-full { max-width: 760px; }
    .markdown { font-size: 1.05rem; line-height: 1.65; }
    .signature-badge-proof { display: grid; grid-template-columns: 104px minmax(0, 1fr); gap: 16px; align-items: center; margin-top: 28px; padding: 14px; border: 1px solid #e7e4ed; background: white; border-radius: 8px; }
    .signature-badge-link { display: grid; place-items: center; border: 1px solid #17151f; background: #fffdf7; padding: 4px; }
    .signature-badge-link img, .collected-badge img { width: 100%; height: auto; image-rendering: pixelated; border-radius: 0; }
    .signature-badge-proof h2 { margin: 2px 0 6px; }
    .proof-details { margin-top: 8px; }
    .badge-collection { max-width: 900px; }
    .badge-forest-group, .badge-shell-group { display: grid; gap: 12px; margin-top: 24px; }
    .badge-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; }
    .collected-badge { display: grid; grid-template-columns: 74px minmax(0, 1fr); gap: 12px; align-items: start; border: 1px solid #e7e4ed; background: white; border-radius: 8px; padding: 12px; }
    .collected-badge h4 { margin: 0 0 6px; }
    .collected-badge p { margin: 0 0 8px; }
    .archive-list { display: grid; gap: 10px; padding-left: 1.2em; }
    .archive-list li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; }
    .public-footer { display: flex; justify-content: space-between; align-items: center; gap: 14px; flex-wrap: wrap; width: min(980px, 92vw); margin: 0 auto; padding: 18px 0 28px; border-top: 1px solid #e7e4ed; color: #6c6875; font-size: 0.86rem; }
    .powered-by, .tracked-by { display: inline-flex; align-items: center; gap: 8px; color: inherit; font-weight: 800; text-decoration: none; }
    .powered-by img { width: 112px; height: auto; image-rendering: pixelated; }
    .tracker-credits { max-width: 760px; }
    .tracker-list { display: grid; gap: 10px; padding-left: 1.2em; }
    .tracker-list a { overflow-wrap: anywhere; }
    @media (max-width: 640px) {
      .site-header, .post-card { grid-template-columns: 1fr; }
      .site-header { align-items: flex-start; flex-direction: column; }
      .post-card { display: grid; }
      .signature-badge-proof, .collected-badge { grid-template-columns: 1fr; }
      .signature-badge-link { width: 104px; }
      .public-footer { align-items: flex-start; flex-direction: column; }
    }
  `;
}

async function loadBrandAsset(fileName) {
  const assetUrl = new URL(`../assets/brand/${fileName}`, import.meta.url);
  if (assetUrl.protocol !== "file:" && typeof fetch === "function") {
    const response = await fetch(assetUrl);
    if (!response.ok) throw new Error(`Could not load PostSnail brand asset: ${fileName}`);
    return new Uint8Array(await response.arrayBuffer());
  }
  if (assetUrl.protocol === "file:") {
    const { readFile } = await import("node:fs/promises");
    return new Uint8Array(await readFile(assetUrl));
  }
  throw new Error(`Could not load PostSnail brand asset: ${fileName}`);
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
