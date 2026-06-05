import DOMPurify from "./vendor/dompurify/purify.es.mjs";
import { exportBackup, importBackup } from "./src/backup.js";
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
  deletePost,
  loadAppState,
  replaceAppState,
  saveAsset,
  saveCommitHistory,
  saveIdentity,
  savePost,
  saveProfile,
  saveSettings,
} from "./src/storage.js";
import { verifyPostSnailZip } from "./src/verifier.js";

globalThis.DOMPurify = DOMPurify;

const app = document.getElementById("app");
const defaultProfile = {
  siteTitle: "My Microblog",
  description: "A fast static microblog with signed posts.",
  handle: "creator",
  siteUrl: "",
  about: "",
};

const state = {
  activeTab: "write",
  status: "Ready.",
  profile: { ...defaultProfile },
  posts: [],
  assets: [],
  identity: null,
  settings: { warnMetadata: true, language: "en", topics: "", preferredTrackers: "", indexingPolicy: "allow" },
  commitHistory: [],
  form: emptyPostForm(),
  secretKey: null,
  lastManifest: null,
  lastExportVerification: null,
  lastAnnouncePayload: null,
  verifyResult: null,
};

init().catch((error) => {
  app.innerHTML = `<div class="boot">PostSnail could not start: ${escapeHtml(error.message)}</div>`;
});

async function init() {
  const loaded = await loadAppState();
  state.profile = { ...defaultProfile, ...(loaded.profile || {}) };
  state.identity = loaded.identity;
  state.settings = { warnMetadata: true, language: "en", topics: "", preferredTrackers: "", indexingPolicy: "allow", ...(loaded.settings || {}) };
  state.commitHistory = loaded.commitHistory || [];
  state.posts = loaded.posts;
  state.assets = loaded.assets;
  state.form = state.posts[0] ? postToForm(state.posts[0]) : emptyPostForm();
  state.status = "Local library loaded.";
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
    saveProfile(state.profile);
  }
  if (input.matches("[data-settings-field]")) {
    state.settings[input.dataset.settingsField] = input.value;
    saveSettings(state.settings);
  }
});

app.addEventListener("change", async (event) => {
  const input = event.target;
  if (input.matches("[data-post-field]")) {
    state.form[input.dataset.postField] = input.value;
    updatePreview();
  }
  if (input.matches("[data-settings-field]")) {
    state.settings[input.dataset.settingsField] = input.value;
    saveSettings(state.settings);
  }
  if (input.id === "image-upload") {
    await addImages(input.files);
    input.value = "";
  }
  if (input.id === "backup-import") {
    await importBackupFile(input.files?.[0]);
    input.value = "";
  }
  if (input.id === "verify-upload") {
    await verifyZipFile(input.files?.[0]);
    input.value = "";
  }
});

async function handleAction(button) {
  const action = button.dataset.action;
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
      await deletePost(post.id);
      state.posts = state.posts.filter((item) => item.id !== post.id);
      if (state.form.id === post.id) state.form = emptyPostForm();
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
  if (action === "go-verify") {
    state.activeTab = "verify";
    setStatus("Choose the ZIP you just downloaded to verify it locally.");
    render();
    return;
  }
  if (action === "export-backup") {
    downloadText(exportBackup(snapshotState()), `postsnail-backup-${Date.now()}.json`, "application/json");
    setStatus("Backup exported.");
    return;
  }
  if (action === "clear-local") {
    if (window.confirm("Clear all local PostSnail posts, images, profile settings, and encrypted keys?")) {
      await clearAppState();
      state.profile = { ...defaultProfile };
      state.identity = null;
      state.settings = { warnMetadata: true, language: "en", topics: "", preferredTrackers: "", indexingPolicy: "allow" };
      state.commitHistory = [];
      state.posts = [];
      state.assets = [];
      state.form = emptyPostForm();
      state.secretKey = null;
      state.lastManifest = null;
      state.lastExportVerification = null;
      state.lastAnnouncePayload = null;
      state.verifyResult = null;
      state.activeTab = "write";
      setStatus("Local data cleared.");
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
  await savePost(post);
  state.posts = [post, ...state.posts.filter((item) => item.id !== post.id)].sort((a, b) =>
    String(b.updatedAt).localeCompare(String(a.updatedAt)),
  );
  state.form = postToForm(post);
  state.activeTab = "library";
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
    await saveAsset(asset);
    state.assets = [asset, ...state.assets];
    state.form.imageIds = Array.from(new Set([...state.form.imageIds, asset.id]));
  }
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
  await saveIdentity(state.identity);
  setStatus("Publisher key generated, encrypted, and unlocked for this session.");
  render();
}

async function unlockKey() {
  if (!state.identity?.encryptedSecretKey) {
    setStatus("Generate or import an identity first.");
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
  state.lastExportVerification = verification;
  await saveCommitHistory(state.commitHistory);
  setStatus(
    verification.ok
      ? `ZIP ready and verified locally. Fingerprint: ${result.manifest.bundleFingerprint}`
      : `ZIP generated, but local verification found ${verification.errors.length} issue(s).`,
  );
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

async function importBackupFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const imported = importBackup(text);
    await replaceAppState(imported);
    const loaded = await loadAppState();
    state.profile = { ...defaultProfile, ...(loaded.profile || {}) };
    state.identity = loaded.identity;
    state.settings = { warnMetadata: true, language: "en", topics: "", preferredTrackers: "", indexingPolicy: "allow", ...(loaded.settings || {}) };
    state.commitHistory = loaded.commitHistory || [];
    state.posts = loaded.posts;
    state.assets = loaded.assets;
    state.form = state.posts[0] ? postToForm(state.posts[0]) : emptyPostForm();
    state.secretKey = null;
    state.lastManifest = null;
    state.lastAnnouncePayload = null;
    setStatus("Backup imported. Unlock the key before generating a site.");
    render();
  } catch (error) {
    setStatus(error.message);
  }
}

function render() {
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
  `;
}

function renderHeader() {
  return `
    <header class="app-header">
      <a class="brand" href="https://hilazon6.com" target="_blank" rel="noopener noreferrer" aria-label="Hilazon6 home">
        <img class="brand-logo" src="./hilazon6-logo.png" width="132" height="34" alt="Hilazon6">
        <span class="brand-copy"><strong>PostSnail</strong><span>Static microblog admin</span></span>
      </a>
      <div class="status-line" id="status-line">${escapeHtml(state.status)}</div>
      <div class="header-actions">
        <a class="btn ghost" href="./features-qa.html">Features</a>
        <button class="btn ghost" type="button" data-action="tab" data-tab="generate">Generate</button>
        <a class="btn donate-link" href="#donate" data-action="donate">Donate</a>
      </div>
    </header>
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
            <p>${unlocked ? "The private signing key is available in memory for this browser session." : "Generate or unlock your encrypted ML-DSA-65 key before publishing."}</p>
          </div>
          <label class="field">
            <span>Passphrase</span>
            <input type="text" name="username" autocomplete="username" value="postsnail-publisher" hidden>
            <input id="identity-passphrase" type="password" autocomplete="current-password" placeholder="Used only in this browser">
          </label>
          <div class="actions">
            <button class="btn primary" type="button" data-action="generate-key">Generate encrypted key</button>
            <button class="btn" type="button" data-action="unlock-key" ${hasIdentity ? "" : "disabled"}>Unlock key</button>
            <button class="btn" type="button" data-action="copy-public-key" ${hasIdentity ? "" : "disabled"}>Copy public key</button>
          </div>
          <p class="help">The private key is encrypted with your passphrase before it is stored in IndexedDB. PostSnail never sends keys to a backend.</p>
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
        ` : `<div class="empty-state"><span>No public key</span><p>Generate an identity to sign posts and manifests.</p></div>`}
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
        <div class="actions">
          <button class="btn primary" type="button" data-action="generate-site" ${canGenerate ? "" : "disabled"}>Download signed ZIP</button>
          <button class="btn" type="button" data-action="go-verify">Verify a ZIP</button>
          <button class="btn" type="button" data-action="export-backup">Export backup</button>
          <label class="btn" for="backup-import">Import backup</label>
          <input id="backup-import" type="file" accept="application/json,.json" hidden>
          <button class="btn danger" type="button" data-action="clear-local">Clear local data</button>
        </div>
      </section>
      <section class="panel-box">
        <h2 class="panel-title">Export readiness</h2>
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
              <button class="btn small" type="button" data-action="go-verify">Verify this ZIP</button>
            </div>
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
          <div class="step-box"><strong>Unlock identity.</strong><p>Generate or unlock the encrypted publisher key in this browser.</p></div>
          <div class="step-box"><strong>Generate ZIP.</strong><p>Download creator-owned static files with a post-quantum signed fingerprint manifest.</p></div>
          <div class="step-box"><strong>Verify proof.</strong><p>Use the Verify tab to inspect a PostSnail ZIP before publishing or after downloading it from someone else.</p></div>
          <div class="step-box"><strong>Host anywhere.</strong><p>Upload the ZIP contents to a free static host. Registry/search servers can later read <code>.well-known/postsnail.json</code>.</p></div>
        </div>
      </section>
      <section class="panel-box">
        <h2 class="panel-title">Privacy and support</h2>
        <div class="notice good">
          <strong>No backend</strong>
          <p>Posts, images, backups, and private keys stay in your browser unless you export or upload them yourself. PostSnail makes no registry calls in v1.</p>
        </div>
        <div id="donate" class="donate-box" aria-label="Donation options">
          <img class="donate-qr" src="./btc-wallet-qr.svg" width="104" height="104" alt="Bitcoin wallet QR code" loading="lazy" decoding="async">
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

function snapshotState() {
  return {
    profile: state.profile,
    posts: state.posts,
    assets: state.assets,
    identity: state.identity,
    settings: state.settings,
    commitHistory: state.commitHistory,
  };
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
