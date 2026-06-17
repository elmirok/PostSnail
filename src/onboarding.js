const DEFAULT_TITLE = "My Microblog";
const DEFAULT_HANDLE = "creator";

export function getLaunchReadiness(state = {}, options = {}) {
  const settings = state.settings || {};
  const hasLegacyOnboardingState = !hasOnboardingState(settings);
  const hasIdentity = Boolean(state.identity?.publicKey);
  const hasKeyUnlocked = Boolean(state.secretKey);
  const hasBlogProfile = isBlogProfileComplete(state.profile || {});
  const hasPublishedContent = hasPublishedPosts(state.posts) || Number(options.publishedPageCount || 0) > 0;
  const hasPrivateShellBackup = hasLegacyOnboardingState
    ? hasIdentity && hasBlogProfile && hasPublishedContent
    : Boolean(settings.lastShellExportedAt);
  const hasWebsiteZip = Boolean(settings.firstZipExportedAt);
  const isReady = hasIdentity && hasBlogProfile && hasPublishedContent && hasPrivateShellBackup;

  return {
    hasIdentity,
    hasKeyUnlocked,
    hasBlogProfile,
    hasPublishedContent,
    hasPrivateShellBackup,
    hasWebsiteZip,
    hasLegacyOnboardingState,
    isReady,
  };
}

export function shouldShowLaunchGuide(state = {}, options = {}) {
  const readiness = getLaunchReadiness(state, options);
  if (!readiness.isReady) return true;
  if (readiness.hasLegacyOnboardingState) return false;
  return state.settings?.launchGuideCompleted !== true && state.settings?.launchGuideCompleted !== "true";
}

export function markShellBackupNeeded(settings = {}) {
  return {
    ...settings,
    launchGuideCompleted: false,
    lastShellExportedAt: "",
  };
}

export function markShellExported(settings = {}, exportedAt = new Date().toISOString()) {
  return {
    ...settings,
    lastShellExportedAt: exportedAt,
  };
}

export function markWebsiteZipExported(settings = {}, exportedAt = new Date().toISOString(), launchReady = false) {
  return {
    ...settings,
    firstZipExportedAt: settings.firstZipExportedAt || exportedAt,
    launchGuideCompleted: Boolean(launchReady),
  };
}

export function hasOnboardingState(settings = {}) {
  return Object.prototype.hasOwnProperty.call(settings, "launchGuideCompleted")
    || Object.prototype.hasOwnProperty.call(settings, "lastShellExportedAt")
    || Object.prototype.hasOwnProperty.call(settings, "firstZipExportedAt");
}

function isBlogProfileComplete(profile = {}) {
  const title = String(profile.siteTitle || "").trim();
  const handle = String(profile.handle || "").trim();
  const description = String(profile.description || "").trim();
  return Boolean(
    title
      && handle
      && description
      && title !== DEFAULT_TITLE
      && handle !== DEFAULT_HANDLE,
  );
}

function hasPublishedPosts(posts = []) {
  return Array.isArray(posts) && posts.some((post) => post?.status === "published");
}
