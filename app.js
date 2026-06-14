import DOMPurify from "./vendor/dompurify/purify.es.mjs";
import { findUnusedAssets } from "./src/assetCleanup.js";
import { normalizePost, uniqueSlug } from "./src/content.js";
import {
  decryptSecretKey,
  encryptSecretKey,
  generateSigningKeyPair,
  publicKeyToText,
  textToBytes,
} from "./src/crypto.js";
import { buildStaticExport } from "./src/exporter.js";
import { renderMarkdown } from "./src/markdown.js";
import {
  clearAppState,
  loadAppState,
  loadLocalShellEnvelope,
  replaceWithEncryptedLocalShell,
} from "./src/storage.js";
import { verifyPostSnailZip } from "./src/verifier.js";
import { decryptLocalShellState, encryptLocalShellState } from "./src/localShell.js";
import { exportWorkspaceVault, importLegacyBackupJson, importWorkspaceVault } from "./src/workspace.js";
import { buildShellNamePayload, signShellNameRecord } from "./src/shellnames.js";
import { buildSiteMovePayload, signSiteMoveRecord } from "./src/siteMoves.js";
import {
  commentSummary,
  createApprovedCommentRecord,
  createRejectedCommentRecord,
  normalizeCommentsPluginState,
  normalizeTrackerUrls,
  verifyCommentPacket,
} from "./src/comments/plugin.js";
import {
  disablePlugin,
  enablePlugin,
  getOfficialPluginCatalog,
  getOfficialPluginManifest,
  installPlugin,
  isPluginEnabled,
  POSTSNAIL_COMMENTS_PLUGIN_ID,
  POSTSNAIL_PAGES_PLUGIN_ID,
  POSTSNAIL_SNAILLIFT_PLUGIN_ID,
} from "./src/core/index.js";
import { createPagesItem, normalizePagesState } from "./src/pages/plugin.js";
import {
  announceForestAfterLiveVerification,
  createDeploymentLogEntry,
  runSnailLiftSafety,
  verifySnailLiftLiveSite,
  buildSurgeBridgeCommand,
  surgeProvider,
  validateSurgeSettings,
} from "./src/snaillift/index.js";

globalThis.DOMPurify = DOMPurify;

const app = document.getElementById("app");
const FOREST_ANNOUNCE_URL = "https://forest.postsnail.org/api/announce";
const defaultProfile = {
  siteTitle: "My Microblog",
  description: "A fast static microblog with signed posts.",
  handle: "creator",
  siteUrl: "",
  about: "",
};
const defaultSettings = {
  warnMetadata: true,
  language: "en",
  topics: "",
  preferredTrackers: "",
  indexingPolicy: "allow",
  showPoweredBy: true,
  showTrackerCredit: true,
  snailLiftSiteUrl: "",
  snailLiftSurgeSiteUrl: "",
  snailLiftSurgeDomain: "",
  snailLiftSurgeProjectDir: "postsnail-public",
  snailLiftSurgeLogin: "",
  snailLiftSurgeToken: "",
  shellNameForestUrl: "https://forest.postsnail.org",
  shellNameDesiredName: "",
  siteMoveForestUrl: "https://forest.postsnail.org",
  siteMoveFromUrl: "",
  siteMoveToUrl: "",
  siteMoveMode: "move",
  siteMovePublishHistory: false,
};

const state = {
  shellMode: "locked",
  hasEncryptedLocalShell: false,
  hasLegacyLocalData: false,
  pendingLegacyState: null,
  localShellEnvelope: null,
  shellPassphrase: "",
  snailLiftSurgeProgress: "",
  shellSaveTimer: null,
  localShellNotice: false,
  localShellSaveError: false,
  notifyForestAttention: false,
  activeTab: "write",
  pagesSection: "pages",
  pagesEditor: { collection: "pages", id: "" },
  status: "Ready.",
  profile: { ...defaultProfile },
  posts: [],
  assets: [],
  identity: null,
  settings: { ...defaultSettings },
  commitHistory: [],
  plugins: { installed: [], lock: {}, state: {} },
  moderation: { approvedComments: [], rejectedComments: [], blockedPublicKeys: [] },
  trackerUrls: [],
  shellNames: [],
  siteMoves: [],
  appearance: { frontendTheme: "quiet-feed", adminTheme: "default", themeSettings: {} },
  exportHistory: [],
  form: emptyPostForm(),
  secretKey: null,
  lastManifest: null,
  lastExportResult: null,
  lastExportVerification: null,
  lastAnnouncePayload: null,
  lastAnnounceStatus: null,
  lastSnailLiftSafety: null,
  lastSnailLiftCommand: "",
  lastSnailLiftCommands: [],
  lastSnailLiftVerification: null,
  lastSnailLiftLog: null,
  verifyResult: null,
};

init().catch((error) => {
  app.innerHTML = `<div class="boot">PostSnail could not start: ${escapeHtml(error.message)}</div>${renderAppFooter()}`;
});

async function init() {
  const [legacyState, localShellEnvelope] = await Promise.all([loadAppState(), loadLocalShellEnvelope()]);
  state.pendingLegacyState = legacyState;
  state.localShellEnvelope = localShellEnvelope || null;
  state.hasEncryptedLocalShell = Boolean(localShellEnvelope);
  state.hasLegacyLocalData = hasLegacyLocalData(legacyState);
  state.status = state.hasEncryptedLocalShell
    ? "Unlock Local Shell with your passphrase, open a .postsnail vault, or create a new Shell."
    : state.hasLegacyLocalData
      ? "Old browser-local data is not locked yet. Migrate Local Data to encrypt it."
      : "Open a .postsnail Shell or create a new one.";
  render();
}

app.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  event.preventDefault();
  await handleAction(button);
});

app.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (event.target.id !== "post-form") return;
  await saveCurrentPost();
});

app.addEventListener("input", (event) => {
  const input = event.target;
  if (input.matches("[data-post-field]")) {
    state.form[input.dataset.postField] = input.value;
    updatePreview();
  }
  if (input.matches("[data-profile-field]")) {
    state.profile[input.dataset.profileField] = input.value;
    scheduleLocalShellSave();
  }
  if (input.matches("[data-settings-field]")) {
    updateSettingFromInput(input);
  }
  if (input.matches("[data-runtime-field]")) {
    updateRuntimeFieldFromInput(input);
  }
});

app.addEventListener("change", async (event) => {
  const input = event.target;
  if (input.matches("[data-post-field]")) {
    state.form[input.dataset.postField] = input.value;
    updatePreview();
  }
  if (input.matches("[data-settings-field]")) {
    updateSettingFromInput(input);
  }
  if (input.matches("[data-runtime-field]")) {
    updateRuntimeFieldFromInput(input);
  }
  if (input.id === "image-upload") {
    await addImages(input.files);
    input.value = "";
  }
  if (input.id === "workspace-import") {
    await importWorkspaceFile(input.files?.[0]);
    input.value = "";
  }
  if (input.id === "shell-file") {
    setStatus(input.files?.[0] ? "Shell file selected. Enter the passphrase and choose Open Shell." : "Choose a .postsnail Shell file.");
  }
  if (input.id === "legacy-backup-import") {
    await importLegacyBackupFile(input.files?.[0]);
    input.value = "";
  }
  if (input.id === "shell-legacy-import") {
    await importLegacyBackupFile(input.files?.[0], shellPassphrase());
    input.value = "";
  }
  if (input.id === "verify-upload") {
    await verifyZipFile(input.files?.[0]);
    input.value = "";
  }
});

async function handleAction(button) {
  const action = button.dataset.action;
  if (action === "open-shell") {
    await openShellFromGate();
    return;
  }
  if (action === "create-shell") {
    await createShell();
    return;
  }
  if (action === "unlock-local-shell") {
    await unlockLocalShell();
    return;
  }
  if (action === "migrate-local-data") {
    await migrateLocalData();
    return;
  }
  if (action === "close-shell") {
    await closeShell();
    return;
  }
  if (action === "tab") {
    state.activeTab = button.dataset.tab;
    render();
    return;
  }
  if (action === "new-post") {
    state.form = emptyPostForm();
    state.activeTab = "write";
    setStatus("New post draft ready.");
    render();
    return;
  }
  if (action === "edit-post") {
    const post = state.posts.find((item) => item.id === button.dataset.id);
    if (post) {
      state.form = postToForm(post);
      state.activeTab = "write";
      setStatus(`Editing ${post.title || post.slug}.`);
      render();
    }
    return;
  }
  if (action === "delete-post") {
    const post = state.posts.find((item) => item.id === button.dataset.id);
    if (post && window.confirm(`Delete "${post.title || post.slug}" from local storage?`)) {
      state.posts = state.posts.filter((item) => item.id !== post.id);
      if (state.form.id === post.id) state.form = emptyPostForm();
      await persistLocalShellNow();
      setStatus("Post deleted.");
      render();
    }
    return;
  }
  if (action === "detach-image") {
    state.form.imageIds = state.form.imageIds.filter((id) => id !== button.dataset.id);
    setStatus("Image detached from this post.");
    render();
    return;
  }
  if (action === "delete-unused-images") {
    await deleteUnusedImages();
    return;
  }
  if (action === "generate-key") {
    await generateKey();
    return;
  }
  if (action === "unlock-key") {
    await unlockKey();
    return;
  }
  if (action === "copy-public-key") {
    await navigator.clipboard.writeText(state.identity?.publicKey || "");
    setStatus("Public key copied.");
    return;
  }
  if (action === "install-plugin") {
    await installOfficialPlugin(button.dataset.pluginId);
    return;
  }
  if (action === "enable-plugin") {
    await enableOfficialPlugin(button.dataset.pluginId);
    return;
  }
  if (action === "disable-plugin") {
    await disableOfficialPlugin(button.dataset.pluginId);
    return;
  }
  if (action === "go-extensions") {
    state.activeTab = "extensions";
    setStatus("Review official bundled plugins.");
    render();
    return;
  }
  if (action === "publish-snaillift-surge") {
    if (!snailLiftEnabled()) {
      state.activeTab = "extensions";
      setStatus("Enable SnailLift in Extensions before publishing with Surge.");
      render();
      return;
    }
    await publishSnailLiftSurge();
    return;
  }
  if (action === "pages-section") {
    state.pagesSection = button.dataset.section || "pages";
    state.pagesEditor = {
      collection: state.pagesSection === "docs" ? "docs" : "pages",
      id: "",
    };
    setStatus(`PostSnail Pages ${state.pagesSection} section ready.`);
    render();
    return;
  }
  if (action === "save-comments-settings") {
    await saveCommentsSettings();
    return;
  }
  if (action === "verify-comment-packet") {
    verifyCommentPacketFromAdmin();
    return;
  }
  if (action === "approve-comment-packet") {
    await approveCommentPacketFromAdmin();
    return;
  }
  if (action === "reject-comment-packet") {
    await rejectCommentPacketFromAdmin();
    return;
  }
  if (action === "remove-approved-comment") {
    await removeModerationEntry("approvedComments", button.dataset.id || "");
    return;
  }
  if (action === "remove-rejected-comment") {
    await removeModerationEntry("rejectedComments", button.dataset.id || "");
    return;
  }
  if (action === "add-blocked-key") {
    await addBlockedCommentKey();
    return;
  }
  if (action === "remove-blocked-key") {
    await removeBlockedCommentKey(button.dataset.key || "");
    return;
  }
  if (action === "new-pages-item") {
    state.pagesSection = button.dataset.collection === "docs" ? "docs" : "pages";
    state.pagesEditor = { collection: state.pagesSection, id: "" };
    setStatus(`New ${state.pagesSection === "docs" ? "doc" : "page"} ready.`);
    render();
    return;
  }
  if (action === "edit-pages-item") {
    state.pagesSection = button.dataset.collection === "docs" ? "docs" : "pages";
    state.pagesEditor = { collection: state.pagesSection, id: button.dataset.id || "" };
    setStatus(`Editing ${state.pagesSection === "docs" ? "doc" : "page"}.`);
    render();
    return;
  }
  if (action === "save-pages-item") {
    await savePagesItem();
    return;
  }
  if (action === "delete-pages-item") {
    await deletePagesItem(button.dataset.collection, button.dataset.id);
    return;
  }
  if (action === "save-pages-navigation") {
    await savePagesNavigation();
    return;
  }
  if (action === "save-pages-settings") {
    await savePagesSettings();
    return;
  }
  if (action === "register-shellname") {
    await submitShellName("register");
    return;
  }
  if (action === "update-shellname") {
    await submitShellName("update");
    return;
  }
  if (action === "renew-shellname") {
    await submitShellName("renew");
    return;
  }
  if (action === "copy-shellname") {
    await copyText(state.shellNames[0]?.fullName || "");
    setStatus("ShellName copied.");
    return;
  }
  if (action === "submit-site-move") {
    await submitSiteMove();
    return;
  }
  if (action === "copy-site-move") {
    await copyText(state.siteMoves[0]?.record ? JSON.stringify(state.siteMoves[0].record, null, 2) : "");
    setStatus("Site move record copied.");
    return;
  }
  if (action === "generate-site") {
    await generateSiteZip();
    return;
  }
  if (action === "copy-fingerprint") {
    await copyText(state.lastManifest?.bundleFingerprint || state.verifyResult?.summary?.bundleFingerprint || "");
    setStatus("Fingerprint copied.");
    return;
  }
  if (action === "copy-manifest-signature") {
    await copyText(state.lastManifest?.manifestSignature || "");
    setStatus("Manifest signature copied.");
    return;
  }
  if (action === "copy-announce-payload") {
    await copyText(state.lastAnnouncePayload ? JSON.stringify(state.lastAnnouncePayload, null, 2) : "");
    setStatus("Announce payload copied. It is not sent anywhere by PostSnail.");
    return;
  }
  if (action === "notify-forest") {
    await notifyForest();
    return;
  }
  if (action === "verify-snaillift-live") {
    if (!snailLiftEnabled()) {
      state.activeTab = "extensions";
      setStatus("Enable SnailLift in Extensions before live deployment checks.");
      render();
      return;
    }
    await verifySnailLiftLive();
    return;
  }
  if (action === "announce-snaillift-forest") {
    if (!snailLiftEnabled()) {
      state.activeTab = "extensions";
      setStatus("Enable SnailLift in Extensions before notifying Forest through SnailLift.");
      render();
      return;
    }
    await announceSnailLiftForest();
    return;
  }
  if (action === "copy-snaillift-command") {
    await copyText(state.lastSnailLiftCommand || "");
    setStatus("Copied the Surge bridge command.");
    return;
  }
  if (action === "copy-snaillift-commands") {
    await copyText((state.lastSnailLiftCommands || []).join("\n"));
    setStatus("Copied the SnailLift helper commands.");
    return;
  }
  if (action === "go-verify") {
    state.activeTab = "verify";
    setStatus("Choose the ZIP you just downloaded to verify it locally.");
    render();
    return;
  }
  if (action === "export-shell" || action === "export-workspace") {
    await exportWorkspaceFile();
    return;
  }
  if (action === "clear-local") {
    if (window.confirm("Clear all local PostSnail posts, images, profile settings, and encrypted keys?")) {
      clearPendingShellSave();
      await clearAppState();
      resetEditableState();
      state.shellMode = "locked";
      state.hasEncryptedLocalShell = false;
      state.hasLegacyLocalData = false;
      state.pendingLegacyState = null;
      state.localShellEnvelope = null;
      state.shellPassphrase = "";
      setStatus("Local data cleared. Open Shell or Create Shell to continue.");
      render();
    }
    return;
  }
  if (action === "donate") {
    state.activeTab = "info";
    render();
    window.setTimeout(() => {
      const donateBox = document.getElementById("donate");
      donateBox?.scrollIntoView({ block: "center" });
      blinkDonate();
    }, 40);
  }
}

async function openShellFromGate() {
  const file = document.getElementById("shell-file")?.files?.[0];
  const passphrase = shellPassphrase();
  if (!file) {
    setStatus("Choose a .postsnail Shell file first.");
    return;
  }
  if (passphrase.length < 10) {
    setStatus("Enter the Shell passphrase before opening a .postsnail file.");
    return;
  }
  await importWorkspaceFile(file, passphrase, { fromGate: true });
}

async function createShell() {
  const passphrase = shellCreatePassphrase();
  const confirmation = shellCreateConfirm();
  const siteTitle = shellCreateTitle();
  if (passphrase.length < 10) {
    setStatus("Enter a Shell passphrase of at least 10 characters before creating a Shell.");
    return;
  }
  if (passphrase !== confirmation) {
    setStatus("Confirm the new Shell passphrase before creating a Shell.");
    return;
  }
  if (
    (state.hasEncryptedLocalShell || state.hasLegacyLocalData) &&
    !window.confirm("Create a new Shell and replace browser-local data? Export Shell first if you need the current local data.")
  ) {
    return;
  }
  clearPendingShellSave();
  resetEditableState();
  if (siteTitle) state.profile.siteTitle = siteTitle;
  state.shellMode = "unlocked";
  state.shellPassphrase = passphrase;
  state.activeTab = "identity";
  await persistLocalShellNow(passphrase);
  setStatus("Shell created. Create your signature key in Identity; it is not an account.");
  render();
}

async function unlockLocalShell() {
  if (!state.localShellEnvelope) {
    setStatus("No encrypted local Shell was found.");
    return;
  }
  const passphrase = shellPassphrase();
  if (passphrase.length < 10) {
    setStatus("Enter the Shell passphrase to unlock browser-local data.");
    return;
  }
  try {
    const imported = await decryptLocalShellState(state.localShellEnvelope, passphrase);
    restoreImportedState(imported.state);
    state.shellMode = "unlocked";
    state.shellPassphrase = passphrase;
    state.localShellNotice = false;
    state.activeTab = "write";
    setStatus("Local Shell unlocked. The editable cache stays encrypted in IndexedDB.");
    render();
  } catch (error) {
    state.shellMode = "locked";
    state.shellPassphrase = "";
    state.localShellSaveError = false;
    setStatus(error.message);
    render();
  }
}

async function migrateLocalData() {
  if (!state.hasLegacyLocalData || !state.pendingLegacyState) {
    setStatus("No old browser-local data was found.");
    return;
  }
  const passphrase = shellPassphrase();
  if (passphrase.length < 10) {
    setStatus("Enter a new Shell passphrase before migrating old browser-local data.");
    return;
  }
  applyLoadedState(state.pendingLegacyState);
  state.shellMode = "unlocked";
  state.shellPassphrase = passphrase;
  state.localShellNotice = true;
  state.localShellSaveError = false;
  state.secretKey = null;
  await persistLocalShellNow(passphrase);
  setStatus("Old browser-local data encrypted. Export Shell to create a portable .postsnail backup.");
  render();
}

async function closeShell() {
  if (state.shellMode !== "unlocked") return;
  try {
    await persistLocalShellNow();
  } catch {
    return;
  }
  clearPendingShellSave();
  resetEditableState();
  state.shellMode = "locked";
  state.shellPassphrase = "";
  state.secretKey = null;
  const [legacyState, localShellEnvelope] = await Promise.all([loadAppState(), loadLocalShellEnvelope()]);
  state.pendingLegacyState = legacyState;
  state.localShellEnvelope = localShellEnvelope || null;
  state.hasEncryptedLocalShell = Boolean(localShellEnvelope);
  state.hasLegacyLocalData = hasLegacyLocalData(legacyState);
  setStatus("Shell closed. Unlock Local Shell with your passphrase to continue.");
  render();
}

async function saveCurrentPost() {
  const existingSlugs = new Set(state.posts.filter((post) => post.id !== state.form.id).map((post) => post.slug));
  const post = normalizePost({
    ...state.form,
    id: state.form.id || crypto.randomUUID(),
    imageIds: [...state.form.imageIds],
  });
  post.slug = uniqueSlug(post.slug, existingSlugs);
  post.updatedAt = new Date().toISOString();
  if (post.status === "published" && !post.publishedAt) post.publishedAt = post.updatedAt;
  state.posts = [post, ...state.posts.filter((item) => item.id !== post.id)].sort((a, b) =>
    String(b.updatedAt).localeCompare(String(a.updatedAt)),
  );
  state.form = postToForm(post);
  state.activeTab = "library";
  await persistLocalShellNow();
  setStatus("Post saved locally.");
  render();
}

async function addImages(files) {
  const imageFiles = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
  if (!imageFiles.length) return;
  for (const file of imageFiles) {
    const asset = {
      id: crypto.randomUUID(),
      name: file.name,
      type: file.type,
      size: file.size,
      dataBase64: await readFileBase64(file),
      createdAt: new Date().toISOString(),
    };
    state.assets = [asset, ...state.assets];
    state.form.imageIds = Array.from(new Set([...state.form.imageIds, asset.id]));
  }
  await persistLocalShellNow();
  setStatus(`${imageFiles.length} image${imageFiles.length === 1 ? "" : "s"} attached. Originals may contain metadata.`);
  render();
}

async function deleteUnusedImages() {
  const unused = unusedAssets();
  if (!unused.length) {
    setStatus("No unused images found.");
    render();
    return;
  }
  const message = `Delete ${unused.length} unused image${unused.length === 1 ? "" : "s"} from this Shell?`;
  if (!window.confirm(message)) return;
  const unusedIds = new Set(unused.map((asset) => asset.id));
  state.assets = state.assets.filter((asset) => !unusedIds.has(asset.id));
  state.form.imageIds = state.form.imageIds.filter((id) => !unusedIds.has(id));
  await persistLocalShellNow();
  setStatus(`Deleted ${unused.length} unused image${unused.length === 1 ? "" : "s"}.`);
  render();
}

async function generateKey() {
  const passphrase = document.getElementById("identity-passphrase")?.value || "";
  if (passphrase.length < 10) {
    setStatus("Use a passphrase of at least 10 characters.");
    return;
  }
  setStatus("Generating ML-DSA-65 key...");
  await nextFrame();
  const keys = generateSigningKeyPair();
  const encryptedSecretKey = await encryptSecretKey(keys.secretKey, passphrase);
  state.identity = {
    algorithm: "ML-DSA-65",
    publicKey: publicKeyToText(keys.publicKey),
    encryptedSecretKey,
    createdAt: new Date().toISOString(),
  };
  state.secretKey = keys.secretKey;
  await persistLocalShellNow();
  setStatus("Publisher key generated, encrypted, and unlocked for this session.");
  render();
}

async function unlockKey() {
  if (!state.identity?.encryptedSecretKey) {
    setStatus("Create or open a Shell with a signature key first.");
    return;
  }
  const passphrase = document.getElementById("identity-passphrase")?.value || "";
  try {
    state.secretKey = await decryptSecretKey(state.identity.encryptedSecretKey, passphrase);
    setStatus("Signing key unlocked for this session.");
    render();
  } catch (error) {
    setStatus(error.message);
  }
}

async function submitShellName(action) {
  if (!state.identity?.publicKey || !state.secretKey) {
    setStatus("Unlock the publisher key before claiming or updating a ShellName.");
    return;
  }
  const forestUrl = normalizeForestUrl(state.settings.shellNameForestUrl || "https://forest.postsnail.org");
  const desiredName = String(state.settings.shellNameDesiredName || state.profile.handle || "").trim().toLowerCase();
  if (!forestUrl || !desiredName) {
    setStatus("Enter a Forest URL and ShellName first.");
    return;
  }
  let record;
  try {
    const payload = buildShellNamePayload({
      name: desiredName,
      forest: forestUrl,
      siteUrl: state.profile.siteUrl,
      publicKey: state.identity.publicKey,
      bundleFingerprint: state.lastManifest?.bundleFingerprint || "",
      [action === "update" ? "updatedAt" : "createdAt"]: new Date().toISOString(),
    });
    record = signShellNameRecord(payload, state.secretKey);
  } catch (error) {
    setStatus(error.message || "ShellName record could not be created.");
    return;
  }
  setStatus(`${action === "register" ? "Registering" : action === "renew" ? "Renewing" : "Updating"} ShellName...`);
  await nextFrame();
  try {
    const endpoint = new URL(`/shellnames/${action === "register" ? "register" : action === "renew" ? "renew" : "update"}`, forestUrl);
    const response = await fetch(endpoint.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: desiredName, record }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(result.error || "Forest could not save this ShellName.");
      render();
      return;
    }
    const shellName = {
      forest: result.forest || new URL(forestUrl).hostname,
      name: result.name || desiredName,
      fullName: result.fullName || `@${desiredName}@${new URL(forestUrl).hostname}`,
      record: result.record || record,
      siteUrl: result.siteUrl || record.siteUrl,
      publicKey: result.publicKey || state.identity.publicKey,
      bundleFingerprint: result.bundleFingerprint || record.bundleFingerprint || "",
      status: result.status || "active",
      expiresAt: result.expiresAt || "",
      updatedAt: result.updatedAt || new Date().toISOString(),
    };
    state.shellNames = [shellName, ...state.shellNames.filter((item) => item.name !== shellName.name || item.forest !== shellName.forest)];
    await persistLocalShellNow();
    setStatus(`${shellName.fullName} is saved in this Shell. It is an alias, not an account.`);
    render();
  } catch {
    setStatus("Forest could not be reached for ShellNames.");
    render();
  }
}

async function submitSiteMove() {
  if (!state.identity?.publicKey || !state.secretKey) {
    setStatus("Unlock the publisher key before signing a domain move.");
    return;
  }
  const forestUrl = normalizeForestUrl(state.settings.siteMoveForestUrl || state.settings.shellNameForestUrl || "https://forest.postsnail.org");
  const fromUrl = String(state.settings.siteMoveFromUrl || "").trim();
  const toUrl = String(state.settings.siteMoveToUrl || state.profile.siteUrl || "").trim();
  const mode = state.settings.siteMoveMode === "mirror" ? "mirror" : "move";
  if (!forestUrl || !fromUrl || !toUrl) {
    setStatus("Enter Forest URL, old domain, and new domain before changing domains.");
    return;
  }
  if (!state.posts.some((post) => post.status === "published") && !publishedPagesCount()) {
    setStatus("Publish at least one post, page, or doc before verifying the new domain.");
    return;
  }
  setStatus("Building the current public site and verifying the new live domain...");
  await nextFrame();
  const exportResult = await buildCurrentWebsiteExport();
  if (!exportResult) return;
  const { result, verification } = exportResult;
  if (!verification.ok) {
    setStatus(`Domain move paused because local ZIP verification found ${verification.errors.length} issue(s).`);
    render();
    return;
  }
  const liveVerification = await verifySnailLiftLiveSite({
    siteUrl: toUrl,
    exportResult: result,
  });
  if (!liveVerification.ok) {
    setStatus(`Upload the new Website ZIP to ${toUrl} first. Live verification failed: ${liveVerification.errors[0] || "proof files did not match"}`);
    state.lastSnailLiftVerification = liveVerification;
    render();
    return;
  }

  let record;
  try {
    const payload = buildSiteMovePayload({
      mode,
      fromUrl,
      toUrl,
      publicKey: state.identity.publicKey,
      bundleFingerprint: result.bundleFingerprint,
      createdAt: new Date().toISOString(),
    });
    record = signSiteMoveRecord(payload, state.secretKey);
  } catch (error) {
    setStatus(error.message || "Site move record could not be created.");
    return;
  }

  setStatus(mode === "move" ? "Sending signed domain move to Forest..." : "Sending signed mirror relationship to Forest...");
  await nextFrame();
  try {
    const endpoint = new URL("/api/site-moves", forestUrl);
    const response = await fetch(endpoint.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(record),
    });
    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(responseBody.error || "Forest could not apply this domain move.");
      render();
      return;
    }
    const move = {
      id: responseBody.moveId || "",
      status: responseBody.status || (mode === "mirror" ? "mirror" : "moved"),
      mode,
      fromUrl: responseBody.fromUrl || record.fromUrl,
      toUrl: responseBody.toUrl || record.toUrl,
      publicKey: state.identity.publicKey,
      bundleFingerprint: record.bundleFingerprint,
      record,
      createdAt: record.createdAt,
      appliedAt: new Date().toISOString(),
    };
    const previousMoves = move.id ? state.siteMoves.filter((item) => item.id !== move.id) : state.siteMoves;
    state.siteMoves = [move, ...previousMoves];
    state.lastManifest = result.manifest;
    state.lastExportResult = result;
    state.commitHistory = result.commitHistory;
    state.lastExportVerification = verification;
    await persistLocalShellNow();
    setStatus(
      mode === "mirror"
        ? "Forest saved the mirror relationship. Both domains can remain searchable."
        : "Forest moved the site. The old domain is hidden from search and points to the new domain in the audit record.",
    );
    render();
  } catch {
    setStatus("Forest could not be reached for the domain move.");
    render();
  }
}

async function generateSiteZip() {
  const exportResult = await buildCurrentWebsiteExport();
  if (!exportResult) return;
  const { result, verification } = exportResult;
  downloadBytes(result.zipBytes, result.filename, "application/zip");
  state.lastManifest = result.manifest;
  state.lastExportResult = result;
  state.commitHistory = result.commitHistory;
  state.lastAnnouncePayload = result.announcePayload;
  state.lastAnnounceStatus = null;
  state.lastSnailLiftSafety = null;
  state.lastSnailLiftCommand = "";
  state.lastSnailLiftCommands = [];
  state.lastSnailLiftVerification = null;
  state.lastSnailLiftLog = null;
  state.notifyForestAttention = true;
  state.lastExportVerification = verification;
  await persistLocalShellNow();
  setStatus(
    verification.ok
      ? `ZIP ready and verified locally. Fingerprint: ${result.manifest.bundleFingerprint}`
      : `ZIP generated, but local verification found ${verification.errors.length} issue(s).`,
  );
  render();
  window.setTimeout(blinkNotifyForest, 40);
}

async function buildCurrentWebsiteExport() {
  if (!state.identity?.publicKey || !state.secretKey) {
    setStatus("Unlock the publisher key before generating a signed site.");
    state.activeTab = "identity";
    render();
    return null;
  }
  const published = state.posts.filter((post) => post.status === "published");
  if (!published.length && !publishedPagesCount()) {
    setStatus("Publish at least one post, page, or doc before generating the site.");
    return null;
  }
  setStatus("Building signed static files...");
  await nextFrame();
  const result = await buildStaticExport({
    profile: state.profile,
    posts: state.posts,
    assets: state.assets,
    settings: state.settings,
    commitHistory: state.commitHistory,
    plugins: state.plugins,
    moderation: state.moderation,
    appearance: state.appearance,
    shellNames: state.shellNames,
    siteMoves: state.siteMoves,
    publicKey: textToBytes(state.identity.publicKey),
    secretKey: state.secretKey,
  });
  const verification = await verifyPostSnailZip(result.zipBytes);
  return { result, verification };
}

async function publishSnailLiftSurge() {
  const settings = snailLiftSurgeSettings();
  const ready = snailLiftSurgeCanPublish(settings);
  if (!ready.ok) {
    state.snailLiftSurgeProgress = "not-configured";
    state.lastSnailLiftCommand = "";
    state.lastSnailLiftCommands = [];
    setStatus(ready.message);
    render();
    return;
  }

  state.snailLiftSurgeProgress = "publishing";
  state.lastAnnounceStatus = null;
  state.lastSnailLiftVerification = null;
  setStatus("Building files, checking safety, and publishing to Surge...");
  render();

  const exportResult = await buildCurrentWebsiteExport();
  if (!exportResult) {
    state.snailLiftSurgeProgress = "error";
    render();
    return;
  }

  const { result, verification } = exportResult;
  state.lastManifest = result.manifest;
  state.lastExportResult = result;
  state.commitHistory = result.commitHistory;
  state.lastExportVerification = verification;
  if (!verification.ok) {
    state.snailLiftSurgeProgress = "error";
    setStatus(`Surge publish paused because local ZIP verification found ${verification.errors.length} issue(s).`);
    render();
    return;
  }

  try {
    const deploy = await surgeProvider.deploy({
      files: result.files,
      settings,
      secrets: {},
    });

    state.lastSnailLiftSafety = deploy.safety || null;
    state.lastSnailLiftCommand = deploy.bridgeCommand || buildSurgeBridgeCommand();
    state.lastSnailLiftCommands = [];
    state.lastSnailLiftLog = createDeploymentLogEntry({
      provider: "surge",
      siteUrl: settings.siteUrl,
      deploymentUrl: deploy.deploymentUrl || settings.siteUrl,
      bundleFingerprint: result.bundleFingerprint,
      status: deploy.ok ? "verified" : "failed",
      message: deploy.message,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    });
    await rememberSnailLiftLog(state.lastSnailLiftLog);

    if (!deploy.ok) {
      state.snailLiftSurgeProgress = deploy.code === "invalid-surge-settings" ? "not-configured" : "error";
      setStatus(deploy.message || "Surge publish failed.");
      render();
      return;
    }

    state.lastSnailLiftVerification = await verifySnailLiftLiveSite({
      siteUrl: settings.siteUrl,
      exportResult: result,
    });
    state.lastSnailLiftLog = createDeploymentLogEntry({
      provider: "surge",
      siteUrl: settings.siteUrl,
      deploymentUrl: deploy.deploymentUrl || settings.siteUrl,
      bundleFingerprint: result.bundleFingerprint,
      status: state.lastSnailLiftVerification.ok ? "verified" : "failed",
      message: state.lastSnailLiftVerification.ok
        ? "Surge publish completed and live proof verified."
        : state.lastSnailLiftVerification.errors[0] || "Surge deployed, but live proof verification failed.",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    });
    await rememberSnailLiftLog(state.lastSnailLiftLog);

    if (state.lastSnailLiftVerification.ok) {
      const announceResult = await announceForestAfterLiveVerification({
        liveVerification: state.lastSnailLiftVerification,
        announcePayload: result.announcePayload,
      });
      state.lastAnnounceStatus = {
        ok: announceResult.ok,
        status: announceResult.body?.status || "",
        message: announceResult.message || "",
        submissionId: announceResult.body?.submissionId || "",
      };
      state.notifyForestAttention = false;
      state.snailLiftSurgeProgress = "verified";
      setStatus(
        state.lastAnnounceStatus?.ok
          ? "Surge publish verified and Forest notified."
          : "Surge publish verified, but Forest notification needs attention.",
      );
    } else {
      state.snailLiftSurgeProgress = "error";
      setStatus(state.lastSnailLiftVerification.errors[0] || "Surge publish completed, but live proof verification failed.");
    }
    await persistLocalShellNow();
    render();
  } catch (error) {
    state.snailLiftSurgeProgress = "error";
    state.lastSnailLiftLog = createDeploymentLogEntry({
      provider: "surge",
      siteUrl: settings.siteUrl,
      bundleFingerprint: result.bundleFingerprint,
      status: "failed",
      message: error instanceof Error ? error.message : "Surge publish failed.",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    });
    await rememberSnailLiftLog(state.lastSnailLiftLog);
    setStatus(error instanceof Error ? error.message : "Surge publish failed.");
    render();
  }
}

async function notifyForest() {
  if (!state.lastAnnouncePayload) {
    setStatus("Export a Website ZIP first so PostSnail can send its signed public announce.");
    return;
  }
  setStatus("Notifying Forest with the signed public announce...");
  await nextFrame();
  try {
    const response = await fetch(FOREST_ANNOUNCE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(state.lastAnnouncePayload),
    });
    const result = await response.json().catch(() => ({}));
    state.lastAnnounceStatus = {
      ok: response.ok,
      status: result.status || "",
      message: result.error || result.status || "",
      submissionId: result.submissionId || "",
    };
    if (response.ok) {
      setStatus(
        result.status === "current"
          ? "Forest already has this fingerprint."
          : result.status === "pending_live_site"
            ? "Forest is waiting for your live site to show the new fingerprint."
            : "Forest refresh queued. Search will update after verification.",
      );
    } else {
      setStatus(result.error || "Forest could not accept the announce.");
    }
  } catch {
    state.lastAnnounceStatus = { ok: false, status: "", message: "Forest could not be reached.", submissionId: "" };
    setStatus("Forest could not be reached.");
  }
  state.notifyForestAttention = false;
  render();
}

async function verifySnailLiftLive() {
  if (!state.lastExportResult) {
    setStatus("Export a Website ZIP first so SnailLift knows which fingerprint to verify.");
    return;
  }
  const siteUrl = snailLiftLiveSiteUrl();
  setStatus("Verifying the live PostSnail proof files...");
  await nextFrame();
  const verification = await verifySnailLiftLiveSite({
    siteUrl,
    exportResult: state.lastExportResult,
  });
  state.lastSnailLiftVerification = verification;
  state.lastSnailLiftLog = createDeploymentLogEntry({
    provider: state.lastSnailLiftLog?.provider || "manual",
    siteUrl,
    bundleFingerprint: state.lastExportResult.bundleFingerprint,
    status: verification.ok ? "verified" : "failed",
    message: verification.ok ? "Live verification passed." : verification.errors.join("; "),
  });
  await rememberSnailLiftLog(state.lastSnailLiftLog);
  setStatus(verification.ok ? "Live verification passed. Forest notify is now available." : `Live verification failed: ${verification.errors[0]}`);
  render();
}

async function announceSnailLiftForest() {
  const result = await announceForestAfterLiveVerification({
    liveVerification: state.lastSnailLiftVerification,
    announcePayload: state.lastAnnouncePayload,
  });
  state.lastSnailLiftLog = createDeploymentLogEntry({
    ...(state.lastSnailLiftLog || {}),
    status: result.ok ? "success" : "failed",
    forestAnnounced: result.ok,
    message: result.message,
  });
  if (result.ok) {
    state.lastAnnounceStatus = {
      ok: true,
      status: result.body?.status || "",
      message: result.message,
      submissionId: result.body?.submissionId || "",
    };
  }
  await rememberSnailLiftLog(state.lastSnailLiftLog);
  setStatus(result.message);
  render();
}

async function verifyZipFile(file) {
  if (!file) return;
  setStatus("Verifying PostSnail ZIP locally...");
  await nextFrame();
  try {
    const result = await verifyPostSnailZip(new Uint8Array(await file.arrayBuffer()));
    state.verifyResult = result;
    setStatus(
      result.ok
        ? `ZIP verified. Fingerprint: ${result.summary.bundleFingerprint}`
        : `Verification failed with ${result.errors.length} issue(s).`,
    );
    render();
  } catch (error) {
    state.verifyResult = {
      ok: false,
      errors: [error.message],
      checks: [{ label: "ZIP", ok: false, error: error.message }],
      summary: { siteTitle: "", postCount: 0, fileCount: 0, bundleFingerprint: "" },
    };
    setStatus(error.message);
    render();
  }
}

async function exportWorkspaceFile() {
  const passphrase = workspacePassphrase() || state.shellPassphrase;
  if (passphrase.length < 10) {
    setStatus("Enter a Shell passphrase of at least 10 characters before exporting a .postsnail file.");
    return;
  }
  setStatus("Encrypting private Shell vault...");
  await nextFrame();
  try {
    const result = await exportWorkspaceVault(snapshotState(), passphrase);
    downloadText(result.text, result.filename, "application/postsnail+json");
    state.localShellNotice = false;
    state.shellPassphrase = passphrase;
    await replaceWithEncryptedLocalShell(result.text);
    state.localShellEnvelope = result.text;
    state.hasEncryptedLocalShell = true;
    state.hasLegacyLocalData = false;
    state.pendingLegacyState = null;
    setStatus(`Encrypted .postsnail Shell exported. Fingerprint: ${result.envelope.workspaceFingerprint}`);
    render();
  } catch (error) {
    setStatus(error.message);
  }
}

async function importWorkspaceFile(file, passphrase = workspacePassphrase(), options = {}) {
  if (!file) return;
  if (passphrase.length < 10) {
    setStatus("Enter the Shell passphrase before opening a .postsnail file.");
    return;
  }
  try {
    const text = await file.text();
    const imported = await importWorkspaceVault(text, passphrase);
    restoreImportedState(imported.state);
    state.shellMode = "unlocked";
    state.shellPassphrase = passphrase;
    state.localShellNotice = false;
    await persistLocalShellNow(passphrase);
    setStatus(options.fromGate ? "Shell opened. Unlock the publisher key before exporting a new public Website ZIP." : "Encrypted Shell opened. Unlock the publisher key before exporting a new public Website ZIP.");
    render();
  } catch (error) {
    setStatus(error.message);
  }
}

async function importLegacyBackupFile(file, passphrase = workspacePassphrase()) {
  if (!file) return;
  if (passphrase.length < 10) {
    setStatus("Enter a Shell passphrase before migrating a legacy backup JSON file.");
    return;
  }
  try {
    const text = await file.text();
    const imported = importLegacyBackupJson(text);
    restoreImportedState(imported.state);
    state.shellMode = "unlocked";
    state.shellPassphrase = passphrase;
    state.localShellNotice = false;
    await persistLocalShellNow(passphrase);
    const migratedVault = await exportWorkspaceVault(imported.state, passphrase);
    downloadText(migratedVault.text, migratedVault.filename, "application/postsnail+json");
    setStatus("Legacy backup JSON imported and migrated. An encrypted .postsnail Shell was downloaded.");
    render();
  } catch (error) {
    setStatus(error.message);
  }
}

function restoreImportedState(nextState) {
  applyLoadedState(nextState);
  state.pendingLegacyState = null;
  state.hasLegacyLocalData = false;
  state.localShellSaveError = false;
  state.secretKey = null;
  state.lastManifest = null;
  state.lastExportResult = null;
  state.lastExportVerification = null;
  state.lastAnnouncePayload = null;
  state.lastAnnounceStatus = null;
  state.lastSnailLiftSafety = null;
  state.lastSnailLiftCommand = "";
  state.lastSnailLiftCommands = [];
  state.lastSnailLiftVerification = null;
  state.lastSnailLiftLog = null;
  state.notifyForestAttention = false;
  state.verifyResult = null;
}

function render() {
  app.classList.toggle("shell-locked", state.shellMode === "locked");
  if (state.shellMode === "locked") {
    app.innerHTML = `
      ${renderHeader()}
      <section class="app-workbench shell-workbench">
        <div class="panel-scroll">${renderShellGate()}</div>
      </section>
      ${renderAppFooter()}
    `;
    return;
  }
  app.innerHTML = `
    ${renderHeader()}
    ${renderTabs()}
    <section class="app-workbench">
      ${renderPanel("write", renderWrite())}
      ${renderPanel("library", renderLibrary())}
      ${renderPanel("identity", renderIdentity())}
      ${renderPanel("extensions", renderExtensions())}
      ${pagesEnabled() ? renderPanel("pages", renderPagesAdmin()) : ""}
      ${commentsEnabled() ? renderPanel("comments", renderCommentsAdmin()) : ""}
      ${renderPanel("generate", renderGenerate())}
      ${renderPanel("verify", renderVerify())}
      ${renderPanel("info", renderInfo())}
    </section>
    ${renderAppFooter()}
  `;
}

function renderHeader() {
  const locked = state.shellMode === "locked";
  return `
    <header class="app-header">
      <a class="brand" href="../" aria-label="PostSnail home">
        <img class="brand-logo" src="../assets/brand/postsnail-icon.png" width="42" height="42" alt="">
        <span class="brand-copy"><strong>PostSnail</strong><span>Static microblog admin</span></span>
      </a>
      <div class="status-line" id="status-line">${escapeHtml(state.status)}</div>
      <div class="header-actions">
        <a class="btn ghost" href="../features-qa.html">Features</a>
        ${locked ? `<a class="btn ghost" href="../docs/">Docs</a>` : `
          <button class="btn ghost" type="button" data-action="tab" data-tab="generate">Generate</button>
          <button class="btn ghost" type="button" data-action="close-shell">Close Shell</button>
          <a class="btn donate-link" href="#donate" data-action="donate">Donate</a>
        `}
      </div>
    </header>
  `;
}

function renderAppFooter() {
  return `
    <footer class="app-footer">
      <span>© 2026 Boaz Alhadeff. PostSnail is <a href="../LICENSE">Apache-2.0</a> licensed; redistributed copies must preserve <a href="../NOTICE">NOTICE</a> attribution.</span>
      <span><a href="../docs/legal/">Legal</a> · <a href="../THIRD_PARTY_NOTICES.md">Third-party notices</a></span>
    </footer>
  `;
}

function renderTabs() {
  return `
    <nav class="app-tabs" aria-label="PostSnail panels" role="tablist">
      ${[
        ["write", "Write"],
        ["library", "Library"],
        ["identity", "Identity"],
        ["extensions", "Extensions"],
        ...(pagesEnabled() ? [["pages", "Pages"]] : []),
        ...(commentsEnabled() ? [["comments", "Comments"]] : []),
        ["generate", "Generate"],
        ["verify", "Verify"],
        ["info", "Info"],
      ]
        .map(
          ([id, label]) => `
            <button class="tab-btn ${state.activeTab === id ? "active" : ""}" role="tab" aria-selected="${state.activeTab === id}" type="button" data-action="tab" data-tab="${id}">
              ${label}
            </button>
          `,
        )
        .join("")}
    </nav>
  `;
}

function renderShellGate() {
  return `
    <div class="shell-gate">
      <section class="panel-box shell-intro">
        <p class="kicker">Private vault / Local-first / No login</p>
        <h1>Open your PostSnail Shell</h1>
        <p>A Shell is your private PostSnail workspace. It contains your editable blog, drafts, settings, assets, and encrypted signing identity.</p>
        <div class="shell-trust-ribbon" aria-label="Shell trust model">
          <div class="shell-trust-item good">
            <strong>Not an account</strong>
            <p>Your identity is a signature key, not a profile login. No account. No email. No backend login.</p>
          </div>
          <div class="shell-trust-item warning">
            <strong>Private source, public output</strong>
            <p>Your Shell stays private. Your Website ZIP is public.</p>
          </div>
        </div>
      </section>
      <div class="shell-card-grid">
        <section class="panel-box fields shell-card open-shell-card">
          <div>
            <p class="kicker">Existing Shell</p>
            <h2 class="panel-title">Open Shell</h2>
            <p class="help">Choose an encrypted <code>.postsnail</code> vault and unlock it locally with the Shell passphrase.</p>
          </div>
          <label class="field">
            <span>Shell file</span>
            <input id="shell-file" type="file" accept=".postsnail,application/postsnail+json,application/json">
          </label>
          <label class="field">
            <span>Shell passphrase</span>
            <input id="shell-passphrase" type="password" autocomplete="current-password" placeholder="Used only in this browser">
          </label>
          <div class="actions">
            <button class="btn primary" type="button" data-action="open-shell">Open Shell</button>
            ${state.hasEncryptedLocalShell ? `<button class="btn" type="button" data-action="unlock-local-shell">Unlock Local Shell</button>` : ""}
          </div>
          ${state.hasEncryptedLocalShell ? `
            <div class="notice good">
              <strong>Encrypted local Shell found</strong>
              <p>Unlock Local Shell with the Shell passphrase. The browser cache stays encrypted at rest.</p>
            </div>
          ` : ""}
        </section>
        <section class="panel-box fields shell-card create-shell-card">
          <div>
            <p class="kicker">New Shell</p>
            <h2 class="panel-title">Create Shell</h2>
            <p class="help">Start a new private Shell on this browser. This creates a signature workspace, not an account.</p>
          </div>
          <div class="shell-card-steps">
            <div><strong>1</strong><span>Name the blog.</span></div>
            <div><strong>2</strong><span>Choose a Shell passphrase.</span></div>
            <div><strong>3</strong><span>Create the signature key next.</span></div>
          </div>
          <label class="field">
            <span>Shell name / site title</span>
            <input id="shell-create-title" type="text" autocomplete="organization-title" placeholder="My Microblog">
          </label>
          <label class="field">
            <span>New Shell passphrase</span>
            <input id="shell-create-passphrase" type="password" autocomplete="new-password" placeholder="At least 10 characters">
          </label>
          <label class="field">
            <span>Confirm passphrase</span>
            <input id="shell-create-confirm" type="password" autocomplete="new-password" placeholder="Repeat the Shell passphrase">
          </label>
          <div class="notice">
            <strong>No account is created</strong>
            <p>No account. No email. No backend login. This only creates an encrypted local Shell.</p>
          </div>
          <div class="actions">
            <button class="btn primary" type="button" data-action="create-shell">Create Shell</button>
          </div>
        </section>
      </div>
      <section class="panel-box shell-card recovery-shell-card">
        <div>
          <p class="kicker">Recovery</p>
          <h2 class="panel-title">Legacy and migration</h2>
          <p class="help">Use these only for older PostSnail data. Recovery actions use the Open Shell passphrase field.</p>
        </div>
        <div class="actions">
          <label class="btn small" for="shell-legacy-import">Import Legacy Backup JSON</label>
          ${state.hasLegacyLocalData ? `<button class="btn small warning-btn" type="button" data-action="migrate-local-data">Migrate Local Data</button>` : ""}
        </div>
        <input id="shell-legacy-import" type="file" accept="application/json,.json" hidden>
        ${state.hasLegacyLocalData ? `
          <div class="notice warning">
            <strong>Old browser-local data is not locked yet</strong>
            <p>This browser has older plaintext PostSnail data in IndexedDB. Migrate Local Data encrypts it with a Shell passphrase, clears plaintext stores, and then you should Export Shell as a private <code>.postsnail</code> backup.</p>
          </div>
        ` : `
          <p class="help">Old backup? Import Legacy Backup JSON restores the data and downloads a migrated encrypted Shell.</p>
        `}
      </section>
    </div>
  `;
}

function renderPanel(id, contents) {
  return `<section class="app-panel ${state.activeTab === id ? "active" : ""}" data-panel="${id}" ${state.activeTab === id ? "" : "hidden"}><div class="panel-scroll">${contents}</div></section>`;
}

function renderWrite() {
  const attached = state.form.imageIds.map((id) => state.assets.find((asset) => asset.id === id)).filter(Boolean);
  return `
    <div class="grid-2">
      <form id="post-form" class="panel-box fields">
        <div class="actions">
          <button class="btn primary" type="submit">Save post</button>
          <button class="btn" type="button" data-action="new-post">New</button>
        </div>
        <label class="field">
          <span>Title</span>
          <input data-post-field="title" value="${escapeAttr(state.form.title)}" placeholder="Optional title">
        </label>
        <div class="grid-2">
          <label class="field">
            <span>Status</span>
            <select data-post-field="status">
              <option value="published" ${state.form.status === "published" ? "selected" : ""}>Published</option>
              <option value="draft" ${state.form.status === "draft" ? "selected" : ""}>Draft</option>
            </select>
          </label>
          <label class="field">
            <span>Slug</span>
            <input data-post-field="slug" value="${escapeAttr(state.form.slug)}" placeholder="Generated from title">
          </label>
        </div>
        <label class="field">
          <span>Tags</span>
          <input data-post-field="tags" value="${escapeAttr(state.form.tags)}" placeholder="crypto, notes, release">
        </label>
        <label class="field">
          <span>Markdown body</span>
          <textarea data-post-field="body" placeholder="Write a short post or a longer Markdown note.">${escapeHtml(state.form.body)}</textarea>
        </label>
        <label class="field">
          <span>Images</span>
          <input id="image-upload" type="file" accept="image/*" multiple>
        </label>
        <div class="asset-list">
          ${attached.map(renderAttachedAsset).join("") || `<div class="empty-state"><span>No images attached</span><p>Choose local images to include them in the exported static bundle.</p></div>`}
        </div>
        <p class="help">PostSnail stores selected images locally and copies them into the generated ZIP. Browser APIs do not remove original image metadata.</p>
      </form>
      <section class="panel-box">
        <h2 class="panel-title">Preview</h2>
        <div id="preview" class="preview-surface">${renderPreviewBody()}</div>
      </section>
    </div>
  `;
}

function renderLibrary() {
  const unused = unusedAssets();
  return `
    <div class="grid-2">
      <section class="panel-box">
        <div class="actions">
          <h2 class="panel-title">Local posts</h2>
          <button class="btn small" type="button" data-action="new-post">New</button>
        </div>
        <div class="post-list">
          ${state.posts.map(renderPostRow).join("") || `<div class="empty-state"><span>No posts yet</span><p>Create your first local microblog post in Write.</p></div>`}
        </div>
      </section>
      <section class="panel-box">
        <div class="actions">
          <h2 class="panel-title">Images</h2>
          <span class="status-badge ${unused.length ? "draft" : ""}">Unused ${unused.length}</span>
          <button class="btn small danger" type="button" data-action="delete-unused-images" ${unused.length ? "" : "disabled"}>Delete unused</button>
        </div>
        <div class="asset-list">
          ${state.assets.map(renderAssetSummary).join("") || `<div class="empty-state"><span>No images</span><p>Images are imported only from files you select.</p></div>`}
        </div>
      </section>
    </div>
  `;
}

function unusedAssets() {
  return findUnusedAssets(snapshotState(), { extraReferences: [state.form] });
}

function renderIdentity() {
  const hasIdentity = Boolean(state.identity?.publicKey);
  const unlocked = Boolean(state.secretKey);
  const shellName = state.shellNames[0] || null;
  const lastMove = state.siteMoves[0] || null;
  return `
    <div class="grid-2 identity-grid">
      <section class="panel-box">
        <form id="identity-form" class="fields" autocomplete="off">
          <h2 class="panel-title">Publisher identity</h2>
          <div class="notice ${unlocked ? "good" : "warning"}">
            <strong>${unlocked ? "Unlocked" : hasIdentity ? "Locked" : "No key yet"}</strong>
            <p>${unlocked ? "The private signing key is available in memory for this browser session." : "Generate or unlock the Shell signing key before publishing."}</p>
          </div>
          <label class="field">
            <span>Passphrase</span>
            <input type="text" name="username" autocomplete="username" value="postsnail-publisher" hidden>
            <input id="identity-passphrase" type="password" autocomplete="current-password" placeholder="Used only in this browser">
          </label>
          <div class="actions">
            <button class="btn primary" type="button" data-action="generate-key">Create signature key</button>
            <button class="btn" type="button" data-action="unlock-key" ${hasIdentity ? "" : "disabled"}>Unlock key</button>
            <button class="btn" type="button" data-action="copy-public-key" ${hasIdentity ? "" : "disabled"}>Copy public key</button>
          </div>
          <p class="help">Your identity is a signature key, not a profile login. The private key is encrypted with your passphrase before it is stored in IndexedDB. PostSnail never sends keys to a backend.</p>
        </form>
      </section>
      <section class="panel-box">
        <h2 class="panel-title">Public proof data</h2>
        ${hasIdentity ? `
          <div class="metrics">
            <div class="metric"><span>Algorithm</span><b>${escapeHtml(state.identity.algorithm)}</b></div>
            <div class="metric"><span>Created</span><b>${formatDateTime(state.identity.createdAt)}</b></div>
            <div class="metric"><span>Public key</span><b class="hash-cell">${escapeHtml(state.identity.publicKey)}</b></div>
          </div>
        ` : `<div class="empty-state"><span>No public key</span><p>Create a signature key to sign posts and manifests.</p></div>`}
      </section>
    </div>
    <section class="panel-box shellname-panel">
      <div>
        <h2 class="panel-title">ShellNames</h2>
        <p class="help">Claim a readable Forest alias like <code>@name@forest.postsnail.org</code>. It points to this public signing key and microblog URL; it is not an account, DNS, or legal identity.</p>
      </div>
      <div class="grid-2">
        <label class="field">
          <span>Forest URL</span>
          <input data-settings-field="shellNameForestUrl" value="${escapeAttr(state.settings.shellNameForestUrl || "https://forest.postsnail.org")}" placeholder="https://forest.postsnail.org">
        </label>
        <label class="field">
          <span>ShellName</span>
          <input data-settings-field="shellNameDesiredName" value="${escapeAttr(state.settings.shellNameDesiredName || state.profile.handle || "")}" placeholder="creator">
        </label>
      </div>
      <div class="actions">
        <button class="btn primary" type="button" data-action="register-shellname" ${unlocked && hasIdentity ? "" : "disabled"}>Claim ShellName</button>
        <button class="btn" type="button" data-action="update-shellname" ${unlocked && hasIdentity && shellName ? "" : "disabled"}>Update ShellName</button>
        <button class="btn" type="button" data-action="renew-shellname" ${unlocked && hasIdentity && shellName ? "" : "disabled"}>Renew ShellName</button>
        <button class="btn" type="button" data-action="copy-shellname" ${shellName ? "" : "disabled"}>Copy ShellName</button>
      </div>
      ${shellName ? `
        <div class="shellname-record">
          <strong>${escapeHtml(shellName.fullName)}</strong>
          <span>${escapeHtml(shellName.status || "active")} · expires ${escapeHtml(shellName.expiresAt || "unknown")}</span>
          <code>${escapeHtml(shellName.siteUrl || "")}</code>
        </div>
      ` : `<div class="empty-state"><span>No ShellName saved</span><p>Unlock the publisher key to sign a ShellName claim locally and send only the public signed record to Forest.</p></div>`}
    </section>
    <section class="panel-box site-move-panel">
      <div>
        <h2 class="panel-title">Change Domain</h2>
        <p class="help">Tell Forest that this signed Shell moved from an old domain to a new live domain. Forest hides the old domain only when the same publisher key signs the move and the new public proof files verify.</p>
      </div>
      <div class="grid-2">
        <label class="field">
          <span>Forest URL</span>
          <input data-settings-field="siteMoveForestUrl" value="${escapeAttr(state.settings.siteMoveForestUrl || "https://forest.postsnail.org")}" placeholder="https://forest.postsnail.org">
        </label>
        <label class="field">
          <span>Current Shell site URL</span>
          <input value="${escapeAttr(state.profile.siteUrl || "")}" readonly>
        </label>
        <label class="field">
          <span>Old domain</span>
          <input data-settings-field="siteMoveFromUrl" value="${escapeAttr(state.settings.siteMoveFromUrl || "")}" placeholder="https://old.example/">
        </label>
        <label class="field">
          <span>New live domain</span>
          <input data-settings-field="siteMoveToUrl" value="${escapeAttr(state.settings.siteMoveToUrl || state.profile.siteUrl || "")}" placeholder="https://new.example/">
        </label>
      </div>
      <div class="segmented site-move-modes" role="radiogroup" aria-label="Domain move mode">
        <label>
          <input type="radio" data-settings-field="siteMoveMode" name="siteMoveMode" value="move" ${state.settings.siteMoveMode !== "mirror" ? "checked" : ""}>
          <span>Move to new domain</span>
        </label>
        <label>
          <input type="radio" data-settings-field="siteMoveMode" name="siteMoveMode" value="mirror" ${state.settings.siteMoveMode === "mirror" ? "checked" : ""}>
          <span>Keep old domain as mirror</span>
        </label>
      </div>
      <label class="toggle-line">
        <input type="checkbox" data-settings-field="siteMovePublishHistory" ${state.settings.siteMovePublishHistory === true || state.settings.siteMovePublishHistory === "true" ? "checked" : ""}>
        <span>Publish site move history in this site's public proof metadata</span>
      </label>
      <div class="notice">
        <strong>Upload first, then change Forest</strong>
        <p>PostSnail verifies the new live domain before sending the signed move. If the new Website ZIP is not live yet, Forest will reject the move.</p>
      </div>
      <div class="actions">
        <button class="btn primary" type="button" data-action="submit-site-move" ${unlocked && hasIdentity ? "" : "disabled"}>Change Domain</button>
        <button class="btn" type="button" data-action="copy-site-move" ${lastMove?.record ? "" : "disabled"}>Copy last move record</button>
      </div>
      ${lastMove ? `
        <div class="shellname-record">
          <strong>${escapeHtml(lastMove.status === "mirror" ? "Mirror saved" : "Move saved")}</strong>
          <span>${escapeHtml(lastMove.fromUrl || "")} → ${escapeHtml(lastMove.toUrl || "")}</span>
          <code>${escapeHtml(lastMove.id || lastMove.bundleFingerprint || "")}</code>
        </div>
      ` : `<div class="empty-state"><span>No domain moves saved</span><p>Signed move records are kept in the encrypted Shell. They are public only if you enable move-history publishing.</p></div>`}
    </section>
  `;
}

function renderExtensions() {
  const catalog = getOfficialPluginCatalog();
  const warnings = missingPluginWarnings();
  return `
    <div class="grid-2 extensions-grid">
      <section class="panel-box">
        <div>
          <p class="kicker">Official bundled plugins</p>
          <h2 class="panel-title">Extensions</h2>
          <p class="help">Install and enable official plugins shipped with PostSnail. No marketplace, upload, remote code, or third-party plugin execution exists in Alpha 2.</p>
        </div>
        <div class="notice">
          <strong>Install does not mean load</strong>
          <p>Enable only what you use. Public runtime assets still load only on routes that declare them, and admin-only plugins do not enter the Website ZIP.</p>
        </div>
        ${warnings.length ? `
          <div class="notice warning">
            <strong>Missing plugin state preserved</strong>
            ${warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}
          </div>
        ` : ""}
      </section>
      <section class="extension-list">
        ${catalog.map(renderOfficialPluginCard).join("")}
      </section>
    </div>
  `;
}

function renderOfficialPluginCard(manifest) {
  const installed = pluginInstalled(manifest.id);
  const enabled = isPluginEnabled(state.plugins, manifest.id);
  const permissions = manifest.permissions || [];
  const sensitive = permissions.filter((permission) => ["deploy:provider", "fetch:external", "write:pluginState", "write:manifestExtensions"].includes(permission));
  return `
    <article class="panel-box extension-card" data-plugin-id="${escapeAttr(manifest.id)}">
      <div class="extension-card-head">
        <div>
          <p class="kicker">${escapeHtml(manifest.type || "official")} plugin</p>
          <h3>${escapeHtml(manifest.name)}</h3>
          <p>${escapeHtml(manifest.description || "")}</p>
        </div>
        <span class="plugin-status ${enabled ? "good" : installed ? "warning" : ""}">${enabled ? "Enabled" : installed ? "Installed" : "Available"}</span>
      </div>
      <details class="permission-review">
        <summary>Review permissions</summary>
        <dl>
          <dt>Capabilities</dt>
          <dd>${(manifest.capabilities || []).map((item) => `<code>${escapeHtml(item)}</code>`).join(" ") || "None"}</dd>
          <dt>Permissions</dt>
          <dd>${permissions.map((item) => `<code>${escapeHtml(item)}</code>`).join(" ") || "None"}</dd>
          <dt>Runtime assets</dt>
          <dd>${manifest.runtime && Object.keys(manifest.runtime).length ? "Route-scoped public assets declared." : "No public runtime assets."}</dd>
        </dl>
        ${sensitive.length ? `<p class="help">Sensitive permissions: ${sensitive.map((item) => `<code>${escapeHtml(item)}</code>`).join(" ")}. Review them before enabling.</p>` : ""}
      </details>
      <div class="actions">
        <button class="btn small" type="button" data-action="install-plugin" data-plugin-id="${escapeAttr(manifest.id)}" ${installed ? "disabled" : ""}>Install</button>
        <button class="btn small primary" type="button" data-action="enable-plugin" data-plugin-id="${escapeAttr(manifest.id)}" ${enabled ? "disabled" : ""}>Enable</button>
        <button class="btn small" type="button" data-action="disable-plugin" data-plugin-id="${escapeAttr(manifest.id)}" ${enabled ? "" : "disabled"}>Disable</button>
      </div>
      ${manifest.id === "postsnail-comments" ? `<p class="help">PostSnail Comments adds a Comments tab for signed packet review, approved static replies, private rejections, and tracker metadata.</p>` : ""}
      ${manifest.id === "postsnail-snaillift" ? `<p class="help">SnailLift appears in Generate only when enabled. Download ZIP stays available either way.</p>` : ""}
      ${manifest.id === "postsnail-pages" ? `<p class="help">PostSnail Pages adds the Pages tab for static pages, docs, navigation, and homepage override. Draft CMS content stays private in the Shell.</p>` : ""}
    </article>
  `;
}

function renderPagesAdmin() {
  const pages = pagesPluginState();
  const section = ["pages", "docs", "navigation", "settings"].includes(state.pagesSection) ? state.pagesSection : "pages";
  return `
    <div class="pages-admin">
      <section class="panel-box">
        <div>
          <p class="kicker">Official CMS plugin</p>
          <h2 class="panel-title">PostSnail Pages</h2>
          <p class="help">Pages tab content lives inside your encrypted Shell. Published pages enter the Website ZIP; drafts and archived CMS content stay private.</p>
        </div>
        <div class="actions pages-section-tabs" role="tablist" aria-label="PostSnail Pages sections">
          ${[
            ["pages", "Pages"],
            ["docs", "Docs"],
            ["navigation", "Navigation"],
            ["settings", "Settings"],
          ].map(([id, label]) => `<button class="btn small ${section === id ? "primary" : ""}" type="button" data-action="pages-section" data-section="${id}">${label}</button>`).join("")}
        </div>
      </section>
      ${section === "pages" ? renderPagesCollection("pages", pages.pages) : ""}
      ${section === "docs" ? renderPagesCollection("docs", pages.docs) : ""}
      ${section === "navigation" ? renderPagesNavigation(pages) : ""}
      ${section === "settings" ? renderPagesSettings(pages) : ""}
    </div>
  `;
}

function renderPagesCollection(collection, items) {
  const isDocs = collection === "docs";
  const selected = state.pagesEditor.collection === collection
    ? items.find((item) => item.id === state.pagesEditor.id)
    : null;
  const draft = selected || createPagesItem(isDocs ? "doc" : "page", {
    title: "",
    status: "draft",
    ...(isDocs ? { slug: "" } : { path: "" }),
  });
  return `
    <div class="grid-2 pages-workbench">
      <section class="panel-box pages-list">
        <div class="actions">
          <div>
            <p class="kicker">${isDocs ? "Docs" : "Pages"}</p>
            <h3>${isDocs ? "Docs collection" : "Static pages"}</h3>
          </div>
          <button class="btn small primary" type="button" data-action="new-pages-item" data-collection="${collection}">New ${isDocs ? "doc" : "page"}</button>
        </div>
        ${items.length ? items.map((item) => renderPagesRow(collection, item)).join("") : `<div class="empty-state"><span>No ${isDocs ? "docs" : "pages"} yet</span><p>Create published CMS content or keep drafts private in the Shell.</p></div>`}
      </section>
      <section class="panel-box pages-editor fields">
        <div>
          <p class="kicker">${selected ? "Edit" : "Create"} ${isDocs ? "doc" : "page"}</p>
          <h3>${escapeHtml(draft.title || (isDocs ? "Untitled doc" : "Untitled page"))}</h3>
        </div>
        <input id="pages-editor-id" value="${escapeAttr(selected?.id || "")}" hidden>
        <input id="pages-editor-collection" value="${collection}" hidden>
        <label class="field">
          <span>Title</span>
          <input data-pages-field="title" value="${escapeAttr(selected?.title || "")}" placeholder="${isDocs ? "Protocol" : "Welcome"}">
        </label>
        <div class="grid-2">
          <label class="field">
            <span>Status</span>
            <select data-pages-field="status">
              ${["draft", "published", "archived"].map((status) => `<option value="${status}" ${(selected?.status || "draft") === status ? "selected" : ""}>${capitalize(status)}</option>`).join("")}
            </select>
          </label>
          ${isDocs ? `
            <label class="field">
              <span>Slug</span>
              <input data-pages-field="slug" value="${escapeAttr(selected?.slug || "")}" placeholder="protocol">
            </label>
          ` : `
            <label class="field">
              <span>Path</span>
              <input data-pages-field="path" value="${escapeAttr(selected?.path || "")}" placeholder="/about-project/">
            </label>
          `}
        </div>
        ${isDocs ? `
          <div class="grid-2">
            <label class="field">
              <span>Section</span>
              <input data-pages-field="section" value="${escapeAttr(selected?.section || "")}" placeholder="Protocol">
            </label>
            <label class="field">
              <span>Order</span>
              <input data-pages-field="order" value="${escapeAttr(selected?.order || 0)}" inputmode="numeric">
            </label>
          </div>
        ` : `
          <label class="field">
            <span>Excerpt</span>
            <input data-pages-field="excerpt" value="${escapeAttr(selected?.excerpt || "")}" placeholder="Short public summary">
          </label>
        `}
        <label class="field">
          <span>Markdown body</span>
          <textarea data-pages-field="body" placeholder="Write page Markdown.">${escapeHtml(selected?.body || "")}</textarea>
        </label>
        <div class="grid-2">
          <label class="field">
            <span>SEO title</span>
            <input data-pages-seo-field="title" value="${escapeAttr(selected?.seo?.title || "")}">
          </label>
          <label class="field">
            <span>SEO description</span>
            <input data-pages-seo-field="description" value="${escapeAttr(selected?.seo?.description || "")}">
          </label>
        </div>
        <label class="field checkbox-field">
          <input type="checkbox" data-pages-seo-field="noindex" ${selected?.seo?.noindex ? "checked" : ""}>
          <span>Noindex this page</span>
        </label>
        <div class="actions">
          <button class="btn primary" type="button" data-action="save-pages-item">Save ${isDocs ? "doc" : "page"}</button>
        </div>
      </section>
    </div>
  `;
}

function renderPagesRow(collection, item) {
  const route = collection === "docs" ? `/docs/${item.slug}/` : item.path;
  return `
    <article class="post-row pages-row">
      <div>
        <small>${escapeHtml(item.status)} · ${escapeHtml(route)}</small>
        <h3>${escapeHtml(item.title || route)}</h3>
        <p>${escapeHtml(item.excerpt || item.seo?.description || "No summary yet.")}</p>
      </div>
      <div class="actions">
        <button class="btn small" type="button" data-action="edit-pages-item" data-collection="${collection}" data-id="${escapeAttr(item.id)}">Edit</button>
        <button class="btn small danger" type="button" data-action="delete-pages-item" data-collection="${collection}" data-id="${escapeAttr(item.id)}">Delete</button>
      </div>
    </article>
  `;
}

function renderPagesNavigation(pages) {
  const text = pages.navigation.map((item) => `${item.label} | ${item.url}`).join("\n");
  return `
    <section class="panel-box pages-editor fields">
      <p class="kicker">Navigation</p>
      <h3>Public site navigation</h3>
      <p class="help">One item per line: <code>Label | /path/</code>. Links are exported into Pages and microblog routes.</p>
      <label class="field">
        <span>Navigation items</span>
        <textarea id="pages-navigation-text" class="compact" placeholder="Home | /&#10;Docs | /docs/&#10;Blog | /blog/">${escapeHtml(text)}</textarea>
      </label>
      <div class="actions">
        <button class="btn primary" type="button" data-action="save-pages-navigation">Save navigation</button>
      </div>
    </section>
  `;
}

function renderPagesSettings(pages) {
  return `
    <section class="panel-box pages-editor fields">
      <p class="kicker">Settings</p>
      <h3>Pages export settings</h3>
      <div class="notice">
        <strong>Homepage override</strong>
        <p>If a published Page uses path <code>/</code>, PostSnail Pages owns the homepage and the microblog feed moves to this blog path.</p>
      </div>
      <label class="field">
        <span>Blog index path</span>
        <input id="pages-blog-index-path" value="${escapeAttr(pages.settings.blogIndexPath || "/blog/")}" placeholder="/blog/">
      </label>
      <div class="actions">
        <button class="btn primary" type="button" data-action="save-pages-settings">Save settings</button>
      </div>
    </section>
  `;
}

function renderCommentsAdmin() {
  const comments = commentsPluginState();
  const approved = commentEntries("approvedComments");
  const rejected = commentEntries("rejectedComments");
  const blocked = blockedCommentKeys();
  return `
    <div class="comments-admin">
      <section class="panel-box">
        <div>
          <p class="kicker">Official bundled plugin</p>
          <h2 class="panel-title">PostSnail Comments</h2>
          <p class="help">Approved comments become public in the Website ZIP. Rejected comments, blocked keys, and review history stay private in your Shell.</p>
        </div>
        <div class="grid-3">
          <div class="metric"><span>Approved</span><b>${approved.length}</b></div>
          <div class="metric"><span>Rejected</span><b>${rejected.length}</b></div>
          <div class="metric"><span>Blocked keys</span><b>${blocked.length}</b></div>
        </div>
      </section>
      <div class="grid-2 comments-workbench">
        <section class="panel-box fields comments-settings">
          <div>
            <p class="kicker">Tracker discovery</p>
            <h3>Comment trackers</h3>
            <p class="help">Tracker URLs are stored in the encrypted Shell and exposed as public metadata on post pages when comments are enabled.</p>
          </div>
          <label class="field">
            <span>Tracker URLs</span>
            <textarea id="comments-tracker-urls" class="compact" placeholder="https://comments.example">${escapeHtml((comments.trackerUrls || []).join("\n"))}</textarea>
          </label>
          <label class="field checkbox-field">
            <input id="comments-allow-live" type="checkbox" ${comments.allowLiveReplies ? "checked" : ""}>
            <span>Show live signed replies section on public post pages</span>
          </label>
          <div class="actions">
            <button class="btn primary" type="button" data-action="save-comments-settings">Save comments settings</button>
          </div>
        </section>
        <section class="panel-box fields comments-review">
          <div>
            <p class="kicker">Manual review</p>
            <h3>Signed comment packet</h3>
            <p class="help">Paste a signed <code>postsnail-comment-v1</code> packet. PostSnail verifies it locally before approval or rejection.</p>
          </div>
          <label class="field">
            <span>Comment packet JSON</span>
            <textarea id="comments-packet-input" placeholder='{"protocol":"postsnail-comment-v1", ...}'></textarea>
          </label>
          <div class="actions">
            <button class="btn small" type="button" data-action="verify-comment-packet">Verify packet</button>
            <button class="btn small primary" type="button" data-action="approve-comment-packet">Approve</button>
            <button class="btn small" type="button" data-action="reject-comment-packet">Reject</button>
          </div>
        </section>
      </div>
      <div class="grid-2 comments-moderation-grid">
        <section class="panel-box">
          <div class="actions">
            <div>
              <p class="kicker">Public export</p>
              <h3>Approved comments</h3>
            </div>
          </div>
          ${approved.length ? approved.map((entry) => renderCommentModerationRow("approved", entry)).join("") : `<div class="empty-state"><span>No approved comments yet</span><p>Approved replies are exported into the public Website ZIP.</p></div>`}
        </section>
        <section class="panel-box">
          <div class="actions">
            <div>
              <p class="kicker">Private review</p>
              <h3>Rejected comments</h3>
            </div>
          </div>
          ${rejected.length ? rejected.map((entry) => renderCommentModerationRow("rejected", entry)).join("") : `<div class="empty-state"><span>No rejected comments yet</span><p>Rejected replies stay private in the Shell.</p></div>`}
        </section>
      </div>
      <section class="panel-box fields comments-blocklist">
        <div>
          <p class="kicker">Blocklist</p>
          <h3>Blocked author public keys</h3>
          <p class="help">Blocked keys remain private in your Shell and help you keep repeat abuse out of approved exports.</p>
        </div>
        <div class="grid-2">
          <label class="field">
            <span>Author public key</span>
            <input id="comments-blocked-key-input" placeholder="base64:...">
          </label>
          <div class="actions align-end">
            <button class="btn small" type="button" data-action="add-blocked-key">Add blocked key</button>
          </div>
        </div>
        ${blocked.length ? `<div class="blocked-key-list">${blocked.map((key) => `<div class="hash-row"><code class="hash-cell">${escapeHtml(key)}</code><button class="btn small danger" type="button" data-action="remove-blocked-key" data-key="${escapeAttr(key)}">Remove</button></div>`).join("")}</div>` : `<div class="empty-state"><span>No blocked keys</span><p>Only approved comments become public. The blocklist stays private.</p></div>`}
      </section>
    </div>
  `;
}

function renderCommentModerationRow(kind, entry) {
  const summary = commentSummary(entry.comment);
  const isApproved = kind === "approved";
  const label = isApproved ? "approved" : "rejected";
  const when = isApproved ? entry.approvedAt : entry.rejectedAt;
  return `
    <article class="post-row comment-row">
      <div>
        <small>${escapeHtml(summary.postSlug)} · ${escapeHtml(formatDateTime(when || summary.createdAt))}</small>
        <h3>${escapeHtml(summary.authorName)}</h3>
        <p>${escapeHtml(summary.excerpt)}</p>
        <code class="hash-cell">${escapeHtml(summary.authorKey)}</code>
      </div>
      <div class="actions">
        <span class="status-badge ${isApproved ? "good" : "warning"}">${label}</span>
        <button class="btn small danger" type="button" data-action="${isApproved ? "remove-approved-comment" : "remove-rejected-comment"}" data-id="${escapeAttr(summary.commentId)}">Remove</button>
      </div>
    </article>
  `;
}

function renderGenerate() {
  const publishedCount = state.posts.filter((post) => post.status === "published").length;
  const publishedCmsCount = publishedPagesCount();
  const canGenerate = Boolean(state.secretKey && state.identity?.publicKey && (publishedCount || publishedCmsCount));
  return `
    <div class="grid-2">
      <section class="panel-box fields">
        <h2 class="panel-title">Site settings</h2>
        ${state.localShellNotice ? `
          <div class="notice warning">
            <strong>Save this browser-local Shell</strong>
            <p>This Shell came from existing browser storage. Export Shell to create a private <code>.postsnail</code> vault you can move, back up, and reopen later.</p>
          </div>
        ` : ""}
        ${state.localShellSaveError ? `
          <div class="notice warning">
            <strong>Encrypted local save failed</strong>
            <p>Export Shell before closing this browser. PostSnail could not update the encrypted local Shell cache.</p>
          </div>
        ` : ""}
        <label class="field">
          <span>Site title</span>
          <input data-profile-field="siteTitle" value="${escapeAttr(state.profile.siteTitle)}">
        </label>
        <label class="field">
          <span>Description</span>
          <input data-profile-field="description" value="${escapeAttr(state.profile.description)}">
        </label>
        <div class="grid-2">
          <label class="field">
            <span>Handle</span>
            <input data-profile-field="handle" value="${escapeAttr(state.profile.handle)}">
          </label>
          <label class="field">
            <span>Canonical URL</span>
            <input data-profile-field="siteUrl" value="${escapeAttr(state.profile.siteUrl)}" placeholder="https://example.com">
          </label>
        </div>
        <label class="field">
          <span>About page Markdown</span>
          <textarea class="compact" data-profile-field="about">${escapeHtml(state.profile.about)}</textarea>
        </label>
        <div class="grid-2">
          <label class="field">
            <span>Language</span>
            <input data-settings-field="language" value="${escapeAttr(state.settings.language || "en")}" placeholder="en">
          </label>
          <label class="field">
            <span>Indexing</span>
            <select data-settings-field="indexingPolicy">
              <option value="allow" ${(state.settings.indexingPolicy || "allow") === "allow" ? "selected" : ""}>Allow discovery</option>
              <option value="noindex" ${state.settings.indexingPolicy === "noindex" ? "selected" : ""}>No public indexing</option>
            </select>
          </label>
        </div>
        <label class="field">
          <span>Topics</span>
          <input data-settings-field="topics" value="${escapeAttr(state.settings.topics || "")}" placeholder="protocol, notes, research">
        </label>
        <label class="field">
          <span>Preferred trackers</span>
          <textarea class="compact" data-settings-field="preferredTrackers" placeholder="https://tracker.example/announce">${escapeHtml(state.settings.preferredTrackers || "")}</textarea>
        </label>
        <div class="grid-2">
          <label class="field checkbox-field">
            <input type="checkbox" data-settings-field="showPoweredBy" ${settingEnabled("showPoweredBy") ? "checked" : ""}>
            <span>Show Powered by PostSnail</span>
          </label>
          <label class="field checkbox-field">
            <input type="checkbox" data-settings-field="showTrackerCredit" ${settingEnabled("showTrackerCredit") ? "checked" : ""}>
            <span>Show tracker credit</span>
          </label>
        </div>
        <label class="field">
          <span>Shell passphrase</span>
          <input id="workspace-passphrase" type="password" autocomplete="new-password" placeholder="Encrypt or open .postsnail Shell files">
        </label>
        <div class="notice warning">
          <strong>Two exports, two meanings</strong>
          <p><code>.postsnail</code> is your private encrypted editable Shell. <code>.zip</code> is the public static Website ZIP for publishing. Losing the Shell or passphrase can prevent future editing, and the Website ZIP is not the full project source.</p>
        </div>
        <div class="actions">
          <button class="btn primary" type="button" data-action="generate-site" ${canGenerate ? "" : "disabled"}>Export Website ZIP</button>
          <button class="btn" type="button" data-action="go-verify">Verify a ZIP</button>
          <button class="btn" type="button" data-action="export-shell">Export Shell</button>
          <label class="btn" for="workspace-import">Open Shell</label>
          <input id="workspace-import" type="file" accept=".postsnail,application/postsnail+json,application/json" hidden>
          <label class="btn" for="legacy-backup-import">Import Legacy Backup JSON</label>
          <input id="legacy-backup-import" type="file" accept="application/json,.json" hidden>
          <button class="btn danger" type="button" data-action="clear-local">Clear local data</button>
        </div>
      </section>
      <section class="panel-box">
        <h2 class="panel-title">Export readiness</h2>
        <div class="steps export-steps">
          <div class="step-box"><strong>Export Website ZIP.</strong><p>Download and verify the signed public site bundle.</p></div>
          <div class="step-box"><strong>Upload ZIP contents to your live host.</strong><p>Forest checks the live <code>.well-known/postsnail.json</code> fingerprint first.</p></div>
          <div class="step-box"><strong>Click Notify Forest.</strong><p>Forest queues a crawl only after the live fingerprint changes.</p></div>
        </div>
        <div class="grid-3">
          <div class="metric"><span>Published</span><b>${publishedCount}</b></div>
          <div class="metric"><span>Pages</span><b>${publishedCmsCount}</b></div>
          <div class="metric"><span>Images</span><b>${state.assets.length}</b></div>
          <div class="metric"><span>Key</span><b>${state.secretKey ? "Unlocked" : state.identity ? "Locked" : "Missing"}</b></div>
        </div>
        <div class="notice warning">
          <strong>Image metadata</strong>
          <p>Selected images are copied into the ZIP as-is. Strip EXIF/GPS metadata before importing images if that matters for your threat model.</p>
        </div>
        ${state.lastManifest ? `
          <div class="notice good">
            <strong>Last export proof</strong>
            <p class="hash-cell">${escapeHtml(state.lastManifest.bundleFingerprint)}</p>
            <div class="actions">
              <button class="btn small" type="button" data-action="copy-fingerprint">Copy fingerprint</button>
              <button class="btn small" type="button" data-action="copy-manifest-signature">Copy manifest signature</button>
              <button class="btn small" type="button" data-action="copy-announce-payload">Copy announce payload</button>
              <button id="notify-forest-button" class="btn small primary ${state.notifyForestAttention ? "notify-forest-attention" : ""}" type="button" data-action="notify-forest">Notify Forest</button>
              <button class="btn small" type="button" data-action="go-verify">Verify this ZIP</button>
            </div>
            <p>After the new ZIP is live on your public host, Notify Forest sends only this signed public announce. It never sends your private key or Shell.</p>
            <p>If you click before uploading, Forest may reply: Forest is waiting for your live site to show the new fingerprint.</p>
            ${state.lastAnnounceStatus ? `<p>${escapeHtml(state.lastAnnounceStatus.ok ? `Forest response: ${state.lastAnnounceStatus.status || "accepted"}` : state.lastAnnounceStatus.message)}</p>` : ""}
            <p>${state.lastExportVerification?.ok ? "The downloaded ZIP was verified locally immediately after generation." : "Choose the downloaded ZIP in Verify to inspect the proof."}</p>
          </div>
        ` : ""}
        ${snailLiftEnabled() ? "" : renderSnailLiftDisabledPrompt()}
        <section class="snaillift-panel" ${snailLiftEnabled() ? "" : "hidden"}>
          <div>
            <h3>SnailLift</h3>
            <p>Your shell stays private. Your trail goes live.</p>
          </div>
          <div class="notice warning">
            <strong>Deployment boundary</strong>
            <p>SnailLift deploys only your public generated site. Your <code>.postsnail</code> Shell, drafts, private keys, rejected comments, and private plugin state are not uploaded.</p>
          </div>
          ${renderSnailLiftSurgePanel()}
          ${renderSnailLiftStatus()}
          ${renderSnailLiftLog()}
        </section>
      </section>
    </div>
  `;
}

function renderSnailLiftDisabledPrompt() {
  return `
    <section class="snaillift-panel snaillift-disabled">
      <div>
        <h3>SnailLift</h3>
        <p>Your shell stays private. Your trail goes live.</p>
      </div>
      <div class="notice warning">
        <strong>Enable SnailLift in Extensions</strong>
        <p>SnailLift is an official bundled plugin. Enable it to show the Surge publish card. Export Website ZIP remains available without it.</p>
      </div>
      <div class="actions">
        <button class="btn small primary" type="button" data-action="go-extensions">Open Extensions</button>
      </div>
    </section>
  `;
}

function renderSnailLiftSurgePanel() {
  const settings = snailLiftSurgeSettings();
  const phase = snailLiftSurgePhase();
  const canPublish = snailLiftSurgeCanPublish(settings);
  const phaseLabel = snailLiftSurgePhaseLabel(phase);
  const phaseCopy = snailLiftSurgePhaseCopy(phase);
  const phaseClass = phase === "verified" ? "good" : phase === "error" || phase === "not-configured" || phase === "setting-up" ? "warning" : phase === "publishing" ? "warning" : "good";
  return `
    <section class="surge-publish-card">
      <div class="snaillift-card-head">
        <div>
          <p class="kicker">Primary publish path</p>
          <h3 class="panel-title">Surge setup</h3>
          <p class="help">Set this up once. Publish to Surge uses the local bridge, uploads the public site, verifies the live proof files, and notifies Forest only after verification passes.</p>
        </div>
        <span class="publish-state ${phaseClass}">${escapeHtml(phaseLabel)}</span>
      </div>
      <div class="notice ${phase === "error" ? "warning" : phase === "verified" ? "good" : ""}">
        <strong>${escapeHtml(phaseLabel)}</strong>
        <p>${escapeHtml(phaseCopy)}</p>
      </div>
      <div class="grid-2 snaillift-fields">
        <label class="field">
          <span class="field-label-row">Site URL <button class="field-help" type="button" title="The public HTTPS URL where Surge will serve the site." aria-label="Surge site URL help">?</button></span>
          <input data-settings-field="snailLiftSurgeSiteUrl" value="${escapeAttr(settings.siteUrl || state.profile.siteUrl || "")}" placeholder="https://creator.example/">
        </label>
        <label class="field">
          <span class="field-label-row">Domain <button class="field-help" type="button" title="The Surge domain or hostname for the public site." aria-label="Surge domain help">?</button></span>
          <input data-settings-field="snailLiftSurgeDomain" value="${escapeAttr(settings.domain || "")}" placeholder="creator.surge.sh">
        </label>
        <label class="field">
          <span class="field-label-row">Project folder <button class="field-help" type="button" title="The local folder that holds the generated public files for Surge." aria-label="Surge project folder help">?</button></span>
          <input data-settings-field="snailLiftSurgeProjectDir" value="${escapeAttr(settings.projectDir || "postsnail-public")}" placeholder="postsnail-public">
        </label>
        <label class="field">
          <span class="field-label-row">Surge login <button class="field-help" type="button" title="The Surge login email or account identifier stored inside the encrypted Shell." aria-label="Surge login help">?</button></span>
          <input data-settings-field="snailLiftSurgeLogin" value="${escapeAttr(settings.surgeLogin || "")}" placeholder="boaz@example.com">
        </label>
        <label class="field token-field wide">
          <span class="field-label-row">Surge token <button class="field-help" type="button" title="The Surge token stays inside the encrypted Shell and is never written to the public ZIP." aria-label="Surge token help">?</button></span>
          <input data-settings-field="snailLiftSurgeToken" type="password" autocomplete="off" spellcheck="false" value="${escapeAttr(settings.surgeToken || "")}" placeholder="surge-token-value">
          <p class="help">Credentials stay inside the encrypted Shell. They never go into the public ZIP, localStorage, or tracker payloads.</p>
        </label>
      </div>
      <div class="actions">
        <button class="btn small primary" type="button" data-action="publish-snaillift-surge" ${state.lastExportResult ? "" : "disabled"}>Publish to Surge</button>
      </div>
      <details class="snaillift-advanced" ${state.lastSnailLiftCommand ? "open" : ""}>
        <summary>Bridge helper</summary>
        <p class="help">If the one-click bridge is not running yet, start it locally and publish again.</p>
        <div class="actions">
          <button class="btn small" type="button" data-action="copy-snaillift-command" ${state.lastSnailLiftCommand ? "" : "disabled"}>Copy bridge command</button>
        </div>
        ${state.lastSnailLiftCommand ? `<pre class="deploy-command"><code>${escapeHtml(state.lastSnailLiftCommand)}</code></pre>` : ""}
      </details>
      ${!canPublish.ok ? `<div class="notice warning"><strong>Setup needed</strong><p>${escapeHtml(canPublish.message)}</p></div>` : ""}
      <div class="actions">
        <button class="btn small" type="button" data-action="verify-snaillift-live" ${state.lastExportResult ? "" : "disabled"}>Verify live site</button>
        <button class="btn small" type="button" data-action="announce-snaillift-forest" ${state.lastSnailLiftVerification?.ok ? "" : "disabled"}>Notify Forest after verify</button>
      </div>
      <p class="help">Forest notify unlocks only after live verification passes.</p>
    </section>
  `;
}

function renderSnailLiftStatus() {
  const safety = state.lastSnailLiftSafety;
  const verification = state.lastSnailLiftVerification;
  const log = state.lastSnailLiftLog;
  if (!safety && !verification && !log) return "";
  return `
    <div class="proof-summary">
      ${safety ? `<p><strong>Safety:</strong> ${safety.ok ? "Passed" : escapeHtml(safety.errors[0] || "Blocked")}</p>` : ""}
      ${verification ? `<p><strong>Live verification:</strong> ${verification.ok ? "Passed" : escapeHtml(verification.errors[0] || "Failed")}</p>` : ""}
      ${log?.message ? `<p><strong>Deploy log:</strong> ${escapeHtml(log.message)}</p>` : ""}
    </div>
  `;
}

function renderSnailLiftLog() {
  const logs = state.exportHistory
    .filter((entry) => entry?.provider === "surge")
    .slice(-5)
    .reverse();
  if (!logs.length) return "";
  return `
    <div class="deploy-log" aria-label="Deployment log">
      <div class="deploy-log-head">
        <h3>Deployment log</h3>
        <p>Expand a row to inspect the full status, timing, fingerprint, and troubleshooting message.</p>
      </div>
      <div class="deploy-log-scroll">
        ${logs.map((log) => {
          const timestamp = formatDateTime(log.finishedAt || log.startedAt);
          const summaryStatus = escapeHtml(log.status || "status");
          const summaryClass = `deploy-log-status status-${escapeAttr(log.status || "failed")}`;
          const detailsOpen = log.status === "failed" ? " open" : "";
          return `
            <details class="deploy-log-item"${detailsOpen}>
              <summary class="deploy-log-summary">
                <span class="deploy-log-provider">${escapeHtml(log.provider || "provider")}</span>
                <span class="${summaryClass}">${summaryStatus}</span>
                <span class="deploy-log-time">${escapeHtml(timestamp)}</span>
                <span class="deploy-log-site">${escapeHtml(log.siteUrl || "")}</span>
                <span class="hash-cell deploy-log-fingerprint">${escapeHtml(log.bundleFingerprint || "")}</span>
              </summary>
              <div class="deploy-log-body">
                <p><strong>Started:</strong> ${escapeHtml(formatDateTime(log.startedAt))}</p>
                <p><strong>Finished:</strong> ${escapeHtml(formatDateTime(log.finishedAt || log.startedAt))}</p>
                ${log.deploymentUrl ? `<p><strong>Deployment URL:</strong> <a href="${escapeAttr(log.deploymentUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(log.deploymentUrl)}</a></p>` : ""}
                ${log.message ? `<p><strong>Log / error:</strong> ${escapeHtml(log.message)}</p>` : ""}
                ${log.forestAnnounced ? "<p><strong>Forest:</strong> Announced after verification.</p>" : ""}
              </div>
            </details>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderVerify() {
  const result = state.verifyResult;
  return `
    <div class="grid-2">
      <section class="panel-box fields">
        <h2 class="panel-title">Verify signed ZIP</h2>
        <div class="notice">
          <strong>Local verification</strong>
          <p>Choose a PostSnail-generated ZIP. The verifier recomputes file hashes, post digests, post signatures, manifest signature, and the bundle fingerprint in this browser.</p>
        </div>
        <label class="field">
          <span>PostSnail ZIP</span>
          <input id="verify-upload" type="file" accept=".zip,application/zip">
        </label>
        <p class="help">Manifest-only verification is intentionally not included in this sprint because file hashes need the full ZIP contents.</p>
      </section>
      <section class="panel-box">
        <h2 class="panel-title">Verification result</h2>
        ${result ? renderVerifyResult(result) : `<div class="empty-state"><span>No ZIP checked</span><p>Generate or choose a ZIP to see proof results.</p></div>`}
      </section>
    </div>
  `;
}

function renderInfo() {
  return `
    <div class="info-layout">
      <section class="panel-box">
        <p class="kicker">Browser-native / Local processing / No login</p>
        <h1>PostSnail</h1>
        <p>PostSnail writes a static microblog, signs posts and the site manifest with ML-DSA-65, and downloads a ZIP you can publish with Surge or upload to any plain static host.</p>
        <div class="steps">
          <div class="step-box"><strong>Write locally.</strong><p>Create Markdown micro posts, add tags, and attach local images.</p></div>
          <div class="step-box"><strong>Unlock signature key.</strong><p>Create or unlock the encrypted publisher key in this browser.</p></div>
          <div class="step-box"><strong>Generate ZIP.</strong><p>Download creator-owned static files with a post-quantum signed fingerprint manifest.</p></div>
          <div class="step-box"><strong>Verify proof.</strong><p>Use the Verify tab to inspect a PostSnail ZIP before publishing or after downloading it from someone else.</p></div>
          <div class="step-box"><strong>Host anywhere.</strong><p>Upload the ZIP contents to a free static host. Registry/search servers can later read <code>.well-known/postsnail.json</code>.</p></div>
        </div>
      </section>
      <section class="panel-box">
        <h2 class="panel-title">Privacy and support</h2>
        <div class="notice good">
          <strong>No backend</strong>
          <p>Posts, images, Shell vaults, and private keys stay in your browser unless you export or upload them yourself. PostSnail makes no registry calls in v1.</p>
        </div>
        <div id="donate" class="donate-box" aria-label="Donation options">
          <img class="donate-qr" src="../btc-wallet-qr.svg" width="104" height="104" alt="Bitcoin wallet QR code" loading="lazy" decoding="async">
          <div class="donate-copy">
            <a class="kofi-button" href="https://ko-fi.com/K1R720HYDL" target="_blank" rel="noopener noreferrer">
              <img height="36" src="https://storage.ko-fi.com/cdn/kofi6.png?v=6" border="0" alt="Buy Me a Coffee at ko-fi.com" loading="lazy" decoding="async">
            </a>
            <p class="btc-line"><strong>BTC SegWit:</strong> <a class="btc-link" href="bitcoin:bc1qly9je7swum86lna4wyf337keuypcsshuql3xqxzzreuxgvw7sxhq4guund">bc1qly9je7swum86lna4wyf337keuypcsshuql3xqxzzreuxgvw7sxhq4guund</a></p>
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderPostRow(post) {
  return `
    <article class="post-row">
      <div>
        <small>${formatDateTime(post.updatedAt)}</small>
        <h3>${escapeHtml(post.title || post.slug)}</h3>
        <p>${escapeHtml(post.excerpt || "No excerpt yet.")}</p>
      </div>
      <div class="actions">
        <span class="status-badge ${post.status === "draft" ? "draft" : ""}">${post.status}</span>
        <button class="btn small" type="button" data-action="edit-post" data-id="${post.id}">Edit</button>
        <button class="btn small danger" type="button" data-action="delete-post" data-id="${post.id}">Delete</button>
      </div>
    </article>
  `;
}

function renderAttachedAsset(asset) {
  return `
    <div class="asset-chip">
      <img src="${assetSrc(asset)}" alt="${escapeAttr(asset.name)}">
      <div><strong>${escapeHtml(asset.name)}</strong><small>${formatBytes(asset.size)}</small></div>
      <button class="btn small" type="button" data-action="detach-image" data-id="${asset.id}">Detach</button>
    </div>
  `;
}

function renderAssetSummary(asset) {
  return `
    <div class="asset-chip">
      <img src="${assetSrc(asset)}" alt="${escapeAttr(asset.name)}">
      <div><strong>${escapeHtml(asset.name)}</strong><small>${formatBytes(asset.size)}</small></div>
    </div>
  `;
}

function renderPreviewBody() {
  const title = state.form.title || "Untitled post";
  const body = state.form.body || "Start writing to preview Markdown.";
  const images = state.form.imageIds
    .map((id) => state.assets.find((asset) => asset.id === id))
    .filter(Boolean)
    .map((asset) => `<img src="${assetSrc(asset)}" alt="${escapeAttr(asset.name)}">`)
    .join("");
  return `<h1>${escapeHtml(title)}</h1>${images}<div>${renderMarkdown(body)}</div>`;
}

function renderVerifyResult(result) {
  const tone = result.ok ? "good" : "warning";
  return `
    <div class="notice ${tone}">
      <strong>${result.ok ? "Verified" : "Failed"}</strong>
      <p>${result.ok ? "Every manifest, post, file, and fingerprint check passed." : escapeHtml(result.errors.join(" "))}</p>
    </div>
    <div class="grid-3">
      <div class="metric"><span>Posts</span><b>${result.summary.postCount || 0}</b></div>
      <div class="metric"><span>Files</span><b>${result.summary.fileCount || 0}</b></div>
      <div class="metric"><span>Site</span><b>${escapeHtml(result.summary.siteTitle || "Unknown")}</b></div>
    </div>
    <div class="grid-3">
      <div class="metric"><span>ZIP</span><b>${result.summary.zipVerified ? "Verified" : "Failed"}</b></div>
      <div class="metric"><span>Manifest</span><b>${result.summary.manifestSignatureValid ? "Valid" : "Invalid"}</b></div>
      <div class="metric"><span>Posts</span><b>${result.summary.postSignaturesValid ? "Valid" : "Invalid"}</b></div>
      <div class="metric"><span>File hashes</span><b>${result.summary.fileHashesValid ? "Valid" : "Invalid"}</b></div>
      <div class="metric"><span>Identity</span><b>${result.summary.identityValid ? "Valid" : "Invalid"}</b></div>
      <div class="metric"><span>Domain</span><b>${escapeHtml(result.summary.domainBinding || "unknown")}</b></div>
      <div class="metric"><span>Commits</span><b>${result.summary.commitHistoryValid ? "Valid" : "Missing/legacy"}</b></div>
    </div>
    ${result.summary.bundleFingerprint ? `
      <div class="metric">
        <span>Fingerprint</span>
        <b class="hash-cell">${escapeHtml(result.summary.bundleFingerprint)}</b>
      </div>
      <div class="metric">
        <span>Public key</span>
        <b class="hash-cell">${escapeHtml(result.summary.publicKey || "")}</b>
      </div>
      <div class="actions">
        <button class="btn small" type="button" data-action="copy-fingerprint">Copy fingerprint</button>
      </div>
    ` : ""}
    <div class="check-list">
      ${result.checks.map((check) => `
        <div class="check-row ${check.ok ? "ok" : "bad"}">
          <span>${check.ok ? "Pass" : "Fail"}</span>
          <strong>${escapeHtml(check.label)}</strong>
          ${check.error ? `<p>${escapeHtml(check.error)}</p>` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

function updatePreview() {
  const preview = document.getElementById("preview");
  if (preview) preview.innerHTML = renderPreviewBody();
}

function emptyPostForm() {
  return {
    id: "",
    title: "",
    slug: "",
    tags: "",
    status: "published",
    body: "",
    imageIds: [],
  };
}

function postToForm(post) {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    tags: post.tags.join(", "),
    status: post.status,
    body: post.body,
    imageIds: [...post.imageIds],
  };
}

function applyLoadedState(loaded) {
  state.profile = { ...defaultProfile, ...(loaded.profile || {}) };
  state.identity = loaded.identity;
  const loadedSettings = loaded.settings || {};
  state.settings = {
    ...defaultSettings,
    ...loadedSettings,
  };
  // Drop settings from removed pre-Surge SnailLift providers when older Shells open.
  delete state.settings.cloudflareRememberToken;
  delete state.settings.snailLiftCloudflareRememberToken;
  delete state.settings.snailLiftCloudflareApiToken;
  delete state.settings.snailLiftCloudflareAccountId;
  delete state.settings.snailLiftCloudflareProjectName;
  delete state.settings.snailLiftCloudflareBranch;
  delete state.settings.snailLiftGithubOwner;
  delete state.settings.snailLiftGithubRepo;
  delete state.settings.snailLiftGithubBranch;
  delete state.settings.snailLiftGithubTargetDir;
  delete state.settings.snailLiftGithubSiteUrl;
  state.commitHistory = loaded.commitHistory || [];
  state.plugins = loaded.plugins || { installed: [], lock: {}, state: {} };
  state.moderation = loaded.moderation || { approvedComments: [], rejectedComments: [], blockedPublicKeys: [] };
  state.trackerUrls = loaded.trackerUrls || [];
  state.shellNames = loaded.shellNames || [];
  state.siteMoves = loaded.siteMoves || [];
  state.appearance = {
    frontendTheme: "quiet-feed",
    adminTheme: "default",
    themeSettings: {},
    ...(loaded.appearance || {}),
  };
  state.exportHistory = loaded.exportHistory || [];
  state.posts = loaded.posts || [];
  state.assets = loaded.assets || [];
  state.form = state.posts[0] ? postToForm(state.posts[0]) : emptyPostForm();
}

function resetEditableState() {
  state.profile = { ...defaultProfile };
  state.identity = null;
  state.settings = { ...defaultSettings };
  state.commitHistory = [];
  state.plugins = { installed: [], lock: {}, state: {} };
  state.moderation = { approvedComments: [], rejectedComments: [], blockedPublicKeys: [] };
  state.trackerUrls = [];
  state.shellNames = [];
  state.siteMoves = [];
  state.appearance = { frontendTheme: "quiet-feed", adminTheme: "default", themeSettings: {} };
  state.exportHistory = [];
  state.posts = [];
  state.assets = [];
  state.form = emptyPostForm();
  state.secretKey = null;
  state.lastManifest = null;
  state.lastExportVerification = null;
  state.lastAnnouncePayload = null;
  state.lastAnnounceStatus = null;
  state.notifyForestAttention = false;
  state.snailLiftSurgeProgress = "";
  state.verifyResult = null;
  state.localShellNotice = false;
  state.localShellSaveError = false;
  state.activeTab = "write";
}

function hasLegacyLocalData(loaded) {
  return Boolean(
    loaded?.profile ||
      loaded?.identity ||
      (loaded?.posts || []).length ||
      (loaded?.assets || []).length ||
      (loaded?.commitHistory || []).length ||
      Object.keys(loaded?.settings || {}).length ||
      (loaded?.plugins?.installed || []).length ||
      Object.keys(loaded?.plugins?.lock || {}).length ||
      Object.keys(loaded?.plugins?.state || {}).length ||
      (loaded?.moderation?.approvedComments || []).length ||
      (loaded?.moderation?.rejectedComments || []).length ||
      (loaded?.moderation?.blockedPublicKeys || []).length ||
      (loaded?.trackerUrls || []).length ||
      (loaded?.shellNames || []).length ||
      (loaded?.siteMoves || []).length ||
      Object.keys(loaded?.appearance?.themeSettings || {}).length ||
      (loaded?.exportHistory || []).length,
  );
}

function updateSettingFromInput(input) {
  state.settings[input.dataset.settingsField] = input.type === "checkbox" ? input.checked : input.value;
  scheduleLocalShellSave();
}

function settingEnabled(field) {
  return state.settings[field] !== false && state.settings[field] !== "false";
}

function snailLiftEnabled() {
  return isPluginEnabled(state.plugins, POSTSNAIL_SNAILLIFT_PLUGIN_ID);
}

function commentsEnabled() {
  return isPluginEnabled(state.plugins, POSTSNAIL_COMMENTS_PLUGIN_ID);
}

function pagesEnabled() {
  return isPluginEnabled(state.plugins, POSTSNAIL_PAGES_PLUGIN_ID);
}

function pluginInstalled(id) {
  return state.plugins.installed.some((entry) => entry.id === id);
}

function ensureOfficialPluginState(id, plugins) {
  if (id === POSTSNAIL_COMMENTS_PLUGIN_ID) {
    return {
      ...plugins,
      state: {
        ...plugins.state,
        [POSTSNAIL_COMMENTS_PLUGIN_ID]: normalizeCommentsPluginState(plugins.state?.[POSTSNAIL_COMMENTS_PLUGIN_ID] || {}),
      },
    };
  }
  if (id !== POSTSNAIL_PAGES_PLUGIN_ID) return plugins;
  return {
    ...plugins,
    state: {
      ...plugins.state,
      [POSTSNAIL_PAGES_PLUGIN_ID]: normalizePagesState(plugins.state?.[POSTSNAIL_PAGES_PLUGIN_ID] || {}),
    },
  };
}

async function installOfficialPlugin(id) {
  try {
    state.plugins = ensureOfficialPluginState(id, installPlugin(state.plugins, getOfficialPluginManifest(id)));
    await persistLocalShellNow();
    setStatus(`${pluginDisplayName(id)} installed. Enable it when you want it active.`);
    render();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Could not install official plugin.");
    render();
  }
}

async function enableOfficialPlugin(id) {
  try {
    const manifest = getOfficialPluginManifest(id);
    const next = pluginInstalled(id) ? state.plugins : installPlugin(state.plugins, manifest);
    state.plugins = ensureOfficialPluginState(id, enablePlugin(next, id));
    if (id === POSTSNAIL_PAGES_PLUGIN_ID) state.activeTab = "pages";
    if (id === POSTSNAIL_COMMENTS_PLUGIN_ID) state.activeTab = "comments";
    await persistLocalShellNow();
    setStatus(`${pluginDisplayName(id)} enabled.`);
    render();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Could not enable official plugin.");
    render();
  }
}

async function disableOfficialPlugin(id) {
  try {
    state.plugins = disablePlugin(state.plugins, id);
    if (id === POSTSNAIL_PAGES_PLUGIN_ID && state.activeTab === "pages") state.activeTab = "extensions";
    if (id === POSTSNAIL_COMMENTS_PLUGIN_ID && state.activeTab === "comments") state.activeTab = "extensions";
    await persistLocalShellNow();
    setStatus(`${pluginDisplayName(id)} disabled. Its settings remain in this Shell.`);
    render();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Could not disable official plugin.");
    render();
  }
}

function pluginDisplayName(id) {
  try {
    return getOfficialPluginManifest(id).name;
  } catch {
    return String(id || "Plugin");
  }
}

function missingPluginWarnings() {
  const officialIds = new Set(getOfficialPluginCatalog().map((plugin) => plugin.id));
  return state.plugins.installed
    .filter((entry) => !officialIds.has(entry.id))
    .map((entry) => `This Shell uses plugin ${entry.id}, but it is not installed. Its state is preserved.`);
}

function pagesPluginState() {
  return normalizePagesState(state.plugins.state?.[POSTSNAIL_PAGES_PLUGIN_ID] || {});
}

function commentsPluginState() {
  return normalizeCommentsPluginState(state.plugins.state?.[POSTSNAIL_COMMENTS_PLUGIN_ID] || {});
}

function commentEntries(bucket) {
  return Array.isArray(state.moderation?.[bucket]) ? state.moderation[bucket] : [];
}

function blockedCommentKeys() {
  return Array.isArray(state.moderation?.blockedPublicKeys) ? state.moderation.blockedPublicKeys : [];
}

async function saveCommentsPluginState(nextCommentsState) {
  state.plugins = ensureOfficialPluginState(POSTSNAIL_COMMENTS_PLUGIN_ID, state.plugins);
  state.plugins = {
    ...state.plugins,
    state: {
      ...state.plugins.state,
      [POSTSNAIL_COMMENTS_PLUGIN_ID]: normalizeCommentsPluginState(nextCommentsState),
    },
  };
  await persistLocalShellNow();
}

async function saveCommentsSettings() {
  const comments = commentsPluginState();
  await saveCommentsPluginState({
    ...comments,
    trackerUrls: normalizeTrackerUrls(document.getElementById("comments-tracker-urls")?.value || ""),
    allowLiveReplies: Boolean(document.getElementById("comments-allow-live")?.checked),
  });
  setStatus("Comments settings saved in the Shell.");
  render();
}

function commentsPacketInput() {
  return String(document.getElementById("comments-packet-input")?.value || "").trim();
}

function parseAdminCommentPacket() {
  const text = commentsPacketInput();
  if (!text) {
    throw new Error("Paste a signed comment packet first.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Comment packet must be valid JSON.");
  }
}

function verifyCommentPacketFromAdmin() {
  try {
    const packet = parseAdminCommentPacket();
    const targetSlug = String(packet?.target?.postSlug || "").trim();
    const post = state.posts.find((item) => item.slug === targetSlug);
    if (!post) {
      throw new Error("Comment target post slug is not present in this Shell.");
    }
    const verification = verifyCommentPacket(packet, {
      sitePublicKey: state.identity?.publicKey || "",
      postSlug: targetSlug,
    });
    if (!verification.ok) {
      throw new Error(verification.errors[0] || "Comment packet could not be verified.");
    }
    setStatus(`Comment packet verified for ${targetSlug}.`);
  } catch (error) {
    setStatus(error.message || "Comment packet could not be verified.");
  }
  render();
}

async function approveCommentPacketFromAdmin() {
  try {
    const packet = parseAdminCommentPacket();
    const targetSlug = String(packet?.target?.postSlug || "").trim();
    if (!state.posts.some((item) => item.slug === targetSlug)) {
      throw new Error("Comment target post slug is not present in this Shell.");
    }
    const authorKey = String(packet?.author?.publicKey || "").trim();
    if (blockedCommentKeys().includes(authorKey)) {
      throw new Error("This author public key is blocked in this Shell.");
    }
    const entry = createApprovedCommentRecord(packet, {
      sitePublicKey: state.identity?.publicKey || "",
      source: "manual-review",
    });
    state.moderation = {
      ...state.moderation,
      approvedComments: [
        entry,
        ...commentEntries("approvedComments").filter((item) => item?.comment?.commentId !== entry.comment.commentId),
      ],
      rejectedComments: commentEntries("rejectedComments").filter((item) => item?.comment?.commentId !== entry.comment.commentId),
    };
    await persistLocalShellNow();
    setStatus(`Approved comment for ${targetSlug}.`);
    render();
  } catch (error) {
    setStatus(error.message || "Comment could not be approved.");
    render();
  }
}

async function rejectCommentPacketFromAdmin() {
  try {
    const packet = parseAdminCommentPacket();
    const targetSlug = String(packet?.target?.postSlug || "").trim();
    if (!state.posts.some((item) => item.slug === targetSlug)) {
      throw new Error("Comment target post slug is not present in this Shell.");
    }
    const entry = createRejectedCommentRecord(packet, {
      sitePublicKey: state.identity?.publicKey || "",
      source: "manual-review",
    });
    state.moderation = {
      ...state.moderation,
      rejectedComments: [
        entry,
        ...commentEntries("rejectedComments").filter((item) => item?.comment?.commentId !== entry.comment.commentId),
      ],
      approvedComments: commentEntries("approvedComments").filter((item) => item?.comment?.commentId !== entry.comment.commentId),
    };
    await persistLocalShellNow();
    setStatus(`Rejected comment for ${targetSlug}.`);
    render();
  } catch (error) {
    setStatus(error.message || "Comment could not be rejected.");
    render();
  }
}

async function removeModerationEntry(bucket, commentId) {
  if (!commentId) return;
  state.moderation = {
    ...state.moderation,
    [bucket]: commentEntries(bucket).filter((entry) => entry?.comment?.commentId !== commentId),
  };
  await persistLocalShellNow();
  setStatus("Comment moderation entry removed.");
  render();
}

async function addBlockedCommentKey() {
  const value = String(document.getElementById("comments-blocked-key-input")?.value || "").trim();
  if (!value.startsWith("base64:")) {
    setStatus("Blocked author public key must start with base64:.");
    render();
    return;
  }
  state.moderation = {
    ...state.moderation,
    blockedPublicKeys: Array.from(new Set([...blockedCommentKeys(), value])),
  };
  await persistLocalShellNow();
  setStatus("Blocked author key saved in the Shell.");
  render();
}

async function removeBlockedCommentKey(key) {
  if (!key) return;
  state.moderation = {
    ...state.moderation,
    blockedPublicKeys: blockedCommentKeys().filter((entry) => entry !== key),
  };
  await persistLocalShellNow();
  setStatus("Blocked author key removed.");
  render();
}

async function savePagesPluginState(nextPagesState) {
  state.plugins = ensureOfficialPluginState(POSTSNAIL_PAGES_PLUGIN_ID, state.plugins);
  state.plugins = {
    ...state.plugins,
    state: {
      ...state.plugins.state,
      [POSTSNAIL_PAGES_PLUGIN_ID]: normalizePagesState(nextPagesState),
    },
  };
  await persistLocalShellNow();
}

async function savePagesItem() {
  const collection = document.getElementById("pages-editor-collection")?.value === "docs" ? "docs" : "pages";
  const existingId = document.getElementById("pages-editor-id")?.value || "";
  const pages = pagesPluginState();
  const existing = pages[collection].find((item) => item.id === existingId) || {};
  const now = new Date().toISOString();
  const status = document.querySelector("[data-pages-field='status']")?.value || "draft";
  const source = {
    ...existing,
    id: existingId || crypto.randomUUID(),
    title: document.querySelector("[data-pages-field='title']")?.value || "",
    status,
    body: document.querySelector("[data-pages-field='body']")?.value || "",
    updatedAt: now,
    publishedAt: status === "published" ? (existing.publishedAt || now) : existing.publishedAt || "",
    seo: {
      ...(existing.seo || {}),
      title: document.querySelector("[data-pages-seo-field='title']")?.value || "",
      description: document.querySelector("[data-pages-seo-field='description']")?.value || "",
      noindex: Boolean(document.querySelector("[data-pages-seo-field='noindex']")?.checked),
    },
  };
  if (collection === "docs") {
    source.slug = document.querySelector("[data-pages-field='slug']")?.value || source.title;
    source.section = document.querySelector("[data-pages-field='section']")?.value || "";
    source.order = Number(document.querySelector("[data-pages-field='order']")?.value || 0);
  } else {
    source.path = document.querySelector("[data-pages-field='path']")?.value || `/${source.title || "page"}/`;
    source.excerpt = document.querySelector("[data-pages-field='excerpt']")?.value || "";
  }

  try {
    const item = createPagesItem(collection === "docs" ? "doc" : "page", source, { now });
    const next = {
      ...pages,
      [collection]: [item, ...pages[collection].filter((entry) => entry.id !== item.id)],
    };
    await savePagesPluginState(next);
    state.pagesSection = collection;
    state.pagesEditor = { collection, id: item.id };
    setStatus(`${collection === "docs" ? "Doc" : "Page"} saved in the encrypted Shell.`);
    render();
  } catch (error) {
    setStatus(error.message || "PostSnail Pages could not save this item.");
    render();
  }
}

async function deletePagesItem(collection, id) {
  const bucket = collection === "docs" ? "docs" : "pages";
  const pages = pagesPluginState();
  const item = pages[bucket].find((entry) => entry.id === id);
  if (!item) return;
  if (!window.confirm(`Delete "${item.title || id}" from PostSnail Pages?`)) return;
  await savePagesPluginState({
    ...pages,
    [bucket]: pages[bucket].filter((entry) => entry.id !== id),
  });
  state.pagesSection = bucket;
  state.pagesEditor = { collection: bucket, id: "" };
  setStatus(`${bucket === "docs" ? "Doc" : "Page"} deleted from the Shell.`);
  render();
}

async function savePagesNavigation() {
  const pages = pagesPluginState();
  const lines = String(document.getElementById("pages-navigation-text")?.value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const navigation = lines
    .map((line) => {
      const [label, url] = line.split("|").map((part) => String(part || "").trim());
      return label && url ? { label, url } : null;
    })
    .filter(Boolean);
  await savePagesPluginState({ ...pages, navigation });
  setStatus("PostSnail Pages navigation saved.");
  render();
}

async function savePagesSettings() {
  const pages = pagesPluginState();
  await savePagesPluginState({
    ...pages,
    settings: {
      ...(pages.settings || {}),
      blogIndexPath: document.getElementById("pages-blog-index-path")?.value || "/blog/",
    },
  });
  setStatus("PostSnail Pages settings saved.");
  render();
}

function publishedPagesCount() {
  if (!pagesEnabled()) return 0;
  const pages = pagesPluginState();
  return [...pages.pages, ...pages.docs].filter((item) => item.status === "published").length;
}

function snailLiftSurgeSettings() {
  const siteUrl = String(state.settings.snailLiftSurgeSiteUrl || state.profile.siteUrl || "").trim();
  const domain = String(state.settings.snailLiftSurgeDomain || "").trim() || deriveDomainFromSiteUrl(siteUrl);
  return {
    siteUrl,
    domain,
    projectDir: state.settings.snailLiftSurgeProjectDir || "postsnail-public",
    surgeLogin: state.settings.snailLiftSurgeLogin || "",
    surgeToken: state.settings.snailLiftSurgeToken || "",
  };
}

function snailLiftSurgeCanPublish(settings = snailLiftSurgeSettings()) {
  const validation = validateSurgeSettings(settings);
  return {
    ok: validation.ok,
    errors: validation.errors,
    message: validation.errors[0] || "",
    normalized: validation.normalized,
  };
}

function snailLiftSurgePhase() {
  if (state.snailLiftSurgeProgress) return state.snailLiftSurgeProgress;
  const settings = snailLiftSurgeSettings();
  if (!settings.siteUrl || !settings.domain || !settings.surgeLogin || !settings.surgeToken) return "not-configured";
  if (state.lastSnailLiftVerification?.ok && state.lastSnailLiftLog?.provider === "surge") return "verified";
  if (state.lastSnailLiftLog?.provider === "surge" && state.lastSnailLiftLog?.status === "failed") return "error";
  if (state.lastSnailLiftLog?.provider === "surge" && state.lastSnailLiftLog?.status === "prepared") return "setting-up";
  if (state.lastSnailLiftLog?.provider === "surge" && state.lastSnailLiftLog?.status === "verified") return "verified";
  return "connected";
}

function snailLiftSurgePhaseLabel(phase = snailLiftSurgePhase()) {
  return {
    "not-configured": "Not configured",
    "setting-up": "Setting up",
    connected: "Connected",
    publishing: "Publishing",
    verified: "Verified",
    error: "Error",
  }[phase] || "Connected";
}

function snailLiftSurgePhaseCopy(phase = snailLiftSurgePhase()) {
  const siteUrl = snailLiftSurgeSettings().siteUrl || state.profile.siteUrl;
  const lastError = String(state.lastSnailLiftLog?.message || "");
  switch (phase) {
    case "not-configured":
      return "Add the Surge site URL, domain, project folder, login, and token to unlock the one-button publish flow. The local bridge must also be running.";
    case "setting-up":
      return "Surge setup is in progress.";
    case "publishing":
      return `Publishing to ${siteUrl || "Surge"} now. We will verify the live manifest before notifying Forest.`;
    case "verified":
      return `Surge is connected and verified for ${siteUrl || "your site"}.`;
    case "error":
      if (String(lastError).toLowerCase().includes("bridge")) {
        return "The local Surge bridge is unavailable. Start it with npm run surge:bridge, then publish again.";
      }
      if (String(lastError).toLowerCase().includes("token") || String(lastError).toLowerCase().includes("authorization")) {
        return "Surge rejected the token. Check the encrypted Shell credentials and try again.";
      }
      return "Surge publish needs attention. Check the status and repair messages below.";
    default:
      return "Surge is connected. Publish to Surge uses the local bridge, verifies the live proof files, then notifies Forest.";
  }
}

function snailLiftLiveSiteUrl() {
  return (
    state.lastSnailLiftLog?.siteUrl ||
    state.settings.snailLiftSurgeSiteUrl ||
    state.settings.snailLiftSiteUrl ||
    state.profile.siteUrl
  );
}

function updateRuntimeFieldFromInput(input) {
  void input;
}

function normalizeForestUrl(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  try {
    const url = source.includes("://") ? new URL(source) : new URL(`https://${source}`);
    if (url.protocol !== "https:") return "";
    url.hash = "";
    url.search = "";
    url.pathname = "/";
    return url.toString().replace(/\/$/u, "");
  } catch {
    return "";
  }
}

function deriveDomainFromSiteUrl(siteUrl) {
  try {
    return new URL(String(siteUrl || "")).hostname;
  } catch {
    return "";
  }
}

async function rememberSnailLiftLog(log) {
  if (!log) return;
  const key = `${log.provider}|${log.bundleFingerprint}|${log.status}|${log.message}`;
  const existing = state.exportHistory.filter(
    (entry) => `${entry.provider}|${entry.bundleFingerprint}|${entry.status}|${entry.message}` !== key,
  );
  state.exportHistory = [...existing, log].slice(-50);
  await persistLocalShellNow();
}

function snapshotState() {
  return {
    profile: state.profile,
    posts: state.posts,
    assets: state.assets,
    identity: state.identity,
    settings: state.settings,
    commitHistory: state.commitHistory,
    plugins: state.plugins,
    moderation: state.moderation,
    trackerUrls: state.trackerUrls,
    shellNames: state.shellNames,
    siteMoves: state.siteMoves,
    appearance: state.appearance,
    exportHistory: state.exportHistory,
  };
}

function workspacePassphrase() {
  return document.getElementById("workspace-passphrase")?.value || "";
}

function shellPassphrase() {
  return document.getElementById("shell-passphrase")?.value || "";
}

function shellCreateTitle() {
  return String(document.getElementById("shell-create-title")?.value || "").trim();
}

function shellCreatePassphrase() {
  return document.getElementById("shell-create-passphrase")?.value || "";
}

function shellCreateConfirm() {
  return document.getElementById("shell-create-confirm")?.value || "";
}

function scheduleLocalShellSave() {
  if (state.shellMode !== "unlocked" || !state.shellPassphrase) return;
  clearPendingShellSave();
  state.shellSaveTimer = window.setTimeout(() => {
    persistLocalShellNow().catch(() => {});
  }, 500);
}

function clearPendingShellSave() {
  if (state.shellSaveTimer) {
    window.clearTimeout(state.shellSaveTimer);
    state.shellSaveTimer = null;
  }
}

async function persistLocalShellNow(passphrase = state.shellPassphrase) {
  if (state.shellMode !== "unlocked") return;
  clearPendingShellSave();
  if (!passphrase || passphrase.length < 10) {
    state.localShellSaveError = true;
    setStatus("Encrypted local Shell save failed. Export Shell before closing.");
    render();
    throw new Error("Shell passphrase is required to update encrypted local storage.");
  }
  try {
    const encrypted = await encryptLocalShellState(snapshotState(), passphrase);
    await replaceWithEncryptedLocalShell(encrypted.envelopeText);
    state.localShellEnvelope = encrypted.envelopeText;
    state.hasEncryptedLocalShell = true;
    state.hasLegacyLocalData = false;
    state.pendingLegacyState = null;
    state.localShellSaveError = false;
  } catch (error) {
    state.localShellSaveError = true;
    setStatus("Encrypted local Shell save failed. Export Shell before closing.");
    render();
    throw error;
  }
}

function setStatus(message) {
  state.status = message;
  const statusLine = document.getElementById("status-line");
  if (statusLine) statusLine.textContent = message;
}

function blinkDonate() {
  const donateBox = document.getElementById("donate");
  if (!donateBox) return;
  donateBox.classList.remove("blink-attention");
  window.setTimeout(() => donateBox.classList.add("blink-attention"), 20);
  donateBox.addEventListener("animationend", () => donateBox.classList.remove("blink-attention"), { once: true });
}

function blinkNotifyForest() {
  const button = document.getElementById("notify-forest-button");
  if (!button) return;
  state.notifyForestAttention = true;
  button.classList.remove("notify-forest-attention");
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    state.notifyForestAttention = false;
    return;
  }
  window.setTimeout(() => {
    button.classList.add("notify-forest-attention");
    button.addEventListener(
      "animationend",
      () => {
        button.classList.remove("notify-forest-attention");
        state.notifyForestAttention = false;
      },
      { once: true },
    );
  }, 20);
}

function readFileBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function downloadBytes(bytes, filename, type) {
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener noreferrer";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadText(text, filename, type) {
  downloadBytes(new TextEncoder().encode(text), filename, type);
}

async function copyText(value) {
  const text = String(value || "");
  if (!text) return;
  await navigator.clipboard.writeText(text);
}

function assetSrc(asset) {
  return `data:${asset.type || "image/png"};base64,${asset.dataBase64}`;
}

function formatDateTime(value) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function capitalize(value) {
  const text = String(value || "");
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : "";
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
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
