import DOMPurify from "./vendor/dompurify/purify.es.mjs";
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
};

const state = {
  shellMode: "locked",
  hasEncryptedLocalShell: false,
  hasLegacyLocalData: false,
  pendingLegacyState: null,
  localShellEnvelope: null,
  shellPassphrase: "",
  shellSaveTimer: null,
  localShellNotice: false,
  localShellSaveError: false,
  notifyForestAttention: false,
  activeTab: "write",
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
  exportHistory: [],
  form: emptyPostForm(),
  secretKey: null,
  lastManifest: null,
  lastExportVerification: null,
  lastAnnouncePayload: null,
  lastAnnounceStatus: null,
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
  const passphrase = shellPassphrase();
  if (passphrase.length < 10) {
    setStatus("Enter a Shell passphrase of at least 10 characters before creating a Shell.");
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

async function generateSiteZip() {
  if (!state.identity?.publicKey || !state.secretKey) {
    setStatus("Unlock the publisher key before generating a signed site.");
    state.activeTab = "identity";
    render();
    return;
  }
  const published = state.posts.filter((post) => post.status === "published");
  if (!published.length) {
    setStatus("Publish at least one post before generating the site.");
    return;
  }
  setStatus("Generating signed static ZIP...");
  await nextFrame();
  const result = await buildStaticExport({
    profile: state.profile,
    posts: state.posts,
    assets: state.assets,
    settings: state.settings,
    commitHistory: state.commitHistory,
    publicKey: textToBytes(state.identity.publicKey),
    secretKey: state.secretKey,
  });
  const verification = await verifyPostSnailZip(result.zipBytes);
  downloadBytes(result.zipBytes, result.filename, "application/zip");
  state.lastManifest = result.manifest;
  state.commitHistory = result.commitHistory;
  state.lastAnnouncePayload = result.announcePayload;
  state.lastAnnounceStatus = null;
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
  state.lastExportVerification = null;
  state.lastAnnouncePayload = null;
  state.lastAnnounceStatus = null;
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
        <div class="notice good">
          <strong>Not an account</strong>
          <p>Your identity is a signature key, not a profile login. No account. No email. No backend login.</p>
        </div>
        <div class="notice warning">
          <strong>Private source, public output</strong>
          <p>Your Shell stays private. Your Website ZIP is public.</p>
        </div>
      </section>
      <section class="panel-box fields">
        <h2 class="panel-title">Open Shell</h2>
        <p class="help">Choose an encrypted <code>.postsnail</code> vault and unlock it locally with the Shell passphrase.</p>
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
          <button class="btn" type="button" data-action="create-shell">Create Shell</button>
          ${state.hasEncryptedLocalShell ? `<button class="btn" type="button" data-action="unlock-local-shell">Unlock Local Shell</button>` : ""}
          ${state.hasLegacyLocalData ? `<button class="btn warning-btn" type="button" data-action="migrate-local-data">Migrate Local Data</button>` : ""}
        </div>
        ${state.hasEncryptedLocalShell ? `
          <div class="notice good">
            <strong>Encrypted local Shell found</strong>
            <p>Unlock Local Shell with the Shell passphrase. The browser cache stays encrypted at rest.</p>
          </div>
        ` : ""}
        ${state.hasLegacyLocalData ? `
          <div class="notice warning">
            <strong>Old browser-local data is not locked yet</strong>
            <p>This browser has older plaintext PostSnail data in IndexedDB. Migrate Local Data encrypts it with a Shell passphrase, clears plaintext stores, and then you should Export Shell as a private <code>.postsnail</code> backup.</p>
          </div>
        ` : ""}
        <div class="notice">
          <strong>Import Legacy Backup JSON</strong>
          <p>Only use this for older PostSnail backups. It restores the data and downloads a migrated encrypted Shell.</p>
          <label class="btn small" for="shell-legacy-import">Import Legacy Backup JSON</label>
          <input id="shell-legacy-import" type="file" accept="application/json,.json" hidden>
        </div>
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
        <h2 class="panel-title">Images</h2>
        <div class="asset-list">
          ${state.assets.map(renderAssetSummary).join("") || `<div class="empty-state"><span>No images</span><p>Images are imported only from files you select.</p></div>`}
        </div>
      </section>
    </div>
  `;
}

function renderIdentity() {
  const hasIdentity = Boolean(state.identity?.publicKey);
  const unlocked = Boolean(state.secretKey);
  return `
    <div class="grid-2">
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
  `;
}

function renderGenerate() {
  const publishedCount = state.posts.filter((post) => post.status === "published").length;
  const canGenerate = Boolean(state.secretKey && state.identity?.publicKey && publishedCount);
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
      </section>
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
        <p>PostSnail writes a static microblog, signs posts and the site manifest with ML-DSA-65, and downloads a ZIP you can host on Cloudflare Pages, GitHub Pages, Netlify, or any static host.</p>
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
  state.settings = { ...defaultSettings, ...(loaded.settings || {}) };
  state.commitHistory = loaded.commitHistory || [];
  state.plugins = loaded.plugins || { installed: [], lock: {}, state: {} };
  state.moderation = loaded.moderation || { approvedComments: [], rejectedComments: [], blockedPublicKeys: [] };
  state.trackerUrls = loaded.trackerUrls || [];
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
    exportHistory: state.exportHistory,
  };
}

function workspacePassphrase() {
  return document.getElementById("workspace-passphrase")?.value || "";
}

function shellPassphrase() {
  return document.getElementById("shell-passphrase")?.value || "";
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
