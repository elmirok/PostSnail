const DB_NAME = "postsnail-v1";
const DB_VERSION = 1;
export const LOCAL_SHELL_ENVELOPE_KEY = "localShellEnvelope";

export async function loadAppState() {
  const [profile, identity, settings, commitHistory, plugins, moderation, trackerUrls, exportHistory, posts, assets] = await Promise.all([
    getKv("profile"),
    getKv("identity"),
    getKv("settings"),
    getKv("commitHistory"),
    getKv("plugins"),
    getKv("moderation"),
    getKv("trackerUrls"),
    getKv("exportHistory"),
    getAll("posts"),
    getAll("assets"),
  ]);
  return {
    profile: profile || null,
    identity: identity || null,
    settings: settings || {},
    commitHistory: Array.isArray(commitHistory) ? commitHistory : [],
    plugins: normalizePlugins(plugins),
    moderation: normalizeModeration(moderation),
    trackerUrls: Array.isArray(trackerUrls) ? trackerUrls : [],
    exportHistory: Array.isArray(exportHistory) ? exportHistory : [],
    posts: posts.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
    assets: assets.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
  };
}

export function loadLocalShellEnvelope() {
  return getKv(LOCAL_SHELL_ENVELOPE_KEY);
}

export async function replaceWithEncryptedLocalShell(envelopeText) {
  const db = await openDb();
  await transactionDone(db, ["kv", "posts", "assets"], "readwrite", (tx) => {
    tx.objectStore("kv").clear();
    tx.objectStore("posts").clear();
    tx.objectStore("assets").clear();
    tx.objectStore("kv").put(String(envelopeText || ""), LOCAL_SHELL_ENVELOPE_KEY);
  });
}

export async function clearAppState() {
  const db = await openDb();
  await transactionDone(db, ["kv", "posts", "assets"], "readwrite", (tx) => {
    tx.objectStore("kv").clear();
    tx.objectStore("posts").clear();
    tx.objectStore("assets").clear();
  });
}

async function getKv(key) {
  const db = await openDb();
  const tx = db.transaction("kv", "readonly");
  return requestToPromise(tx.objectStore("kv").get(key));
}

async function getAll(storeName) {
  const db = await openDb();
  const tx = db.transaction(storeName, "readonly");
  return requestToPromise(tx.objectStore(storeName).getAll());
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("posts")) db.createObjectStore("posts", { keyPath: "id" });
      if (!db.objectStoreNames.contains("assets")) db.createObjectStore("assets", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(db, stores, mode, callback) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    callback(tx);
  });
}

function normalizePlugins(value) {
  return {
    installed: Array.isArray(value?.installed) ? value.installed : [],
    lock: value?.lock && typeof value.lock === "object" && !Array.isArray(value.lock) ? value.lock : {},
    state: value?.state && typeof value.state === "object" && !Array.isArray(value.state) ? value.state : {},
  };
}

function normalizeModeration(value) {
  return {
    approvedComments: Array.isArray(value?.approvedComments) ? value.approvedComments : [],
    rejectedComments: Array.isArray(value?.rejectedComments) ? value.rejectedComments : [],
    blockedPublicKeys: Array.isArray(value?.blockedPublicKeys) ? value.blockedPublicKeys : [],
  };
}
