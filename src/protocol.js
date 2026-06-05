export const POSTSNAIL_PROTOCOL = "postsnail";
export const POSTSNAIL_PROTOCOL_VERSION = 1;
export const LEGACY_POSTSNAIL_PROTOCOL = "postsnail-v1";

export const CURRENT_MANIFEST_VERSION = 1;
export const CURRENT_IDENTITY_VERSION = 1;
export const CURRENT_COMMIT_VERSION = 1;
export const CURRENT_WORKSPACE_VERSION = 1;

export const REQUIRED_CORE_FEATURES = [
  "signed-manifest",
  "file-hashes",
];

export const KNOWN_OPTIONAL_FEATURES = [
  "identity-document",
  "commit-history",
  "sitemap",
  "workspace-vault",
  "tracker-announce",
  "forest-tracker",
  "comments",
  "cloudflare-deploy",
  "plugins",
];

export const MANIFEST_VERSION = CURRENT_MANIFEST_VERSION;
export const IDENTITY_VERSION = CURRENT_IDENTITY_VERSION;
export const COMMIT_VERSION = CURRENT_COMMIT_VERSION;
export const SIGNATURE_SUITE = "ML-DSA-65";
export const DIGEST_SUITE = "SHA3-512";
export const FINGERPRINT_SUITE = "psn1-sha3-512";

export const IDENTITY_TYPE = "postsnail-identity";
export const COMMIT_TYPE = "postsnail-commit";
export const COMMITS_TYPE = "postsnail-commits";
export const ANNOUNCE_TYPE = "postsnail-announce";

export const WELL_KNOWN_PATH = ".well-known/postsnail.json";
export const MANIFEST_PATH = "postsnail.manifest.json";
export const FEED_PATH = "feed.json";
export const RSS_PATH = "rss.xml";
export const SITEMAP_PATH = "sitemap.xml";
export const LATEST_COMMIT_PATH = ".well-known/postsnail/latest-commit.json";
export const COMMITS_PATH = ".well-known/postsnail/commits.json";
