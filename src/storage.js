const DB_NAME = "postsnail-v1";
const DB_VERSION = 1;

export async function loadAppState() {
  const [profile, identity, settings, commitHistory, posts, assets] = await Promise.all([
    getKv("profile"),
    getKv("identity"),
    getKv("settings"),
    getKv("commitHistory"),
    getAll("posts"),
    getAll("assets"),
  ]);
  return {
    profile: profile || null,
    identity: identity || null,
    settings: settings || {},
    commitHistory: Array.isArray(commitHistory) ? commitHistory : [],
    posts: posts.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
    assets: assets.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
  };
}

export function saveProfile(profile) {
  return setKv("profile", profile);
}

export function saveIdentity(identity) {
  return setKv("identity", identity);
}

export function saveSettings(settings) {
  return setKv("settings", settings);
}

export function saveCommitHistory(commitHistory) {
  return setKv("commitHistory", Array.isArray(commitHistory) ? commitHistory : []);
}

export function savePost(post) {
  return put("posts", post);
}

export function deletePost(id) {
  return remove("posts", id);
}

export function saveAsset(asset) {
  return put("assets", asset);
}

export async function replaceAppState(nextState) {
  const db = await openDb();
  await transactionDone(db, ["kv", "posts", "assets"], "readwrite", (tx) => {
    tx.objectStore("kv").clear();
    tx.objectStore("posts").clear();
    tx.objectStore("assets").clear();
    tx.objectStore("kv").put(nextState.profile || null, "profile");
    tx.objectStore("kv").put(nextState.identity || null, "identity");
    tx.objectStore("kv").put(nextState.settings || {}, "settings");
    tx.objectStore("kv").put(Array.isArray(nextState.commitHistory) ? nextState.commitHistory : [], "commitHistory");
    for (const post of nextState.posts || []) tx.objectStore("posts").put(post);
    for (const asset of nextState.assets || []) tx.objectStore("assets").put(asset);
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

async function setKv(key, value) {
  const db = await openDb();
  await transactionDone(db, "kv", "readwrite", (tx) => {
    tx.objectStore("kv").put(value, key);
  });
}

async function getAll(storeName) {
  const db = await openDb();
  const tx = db.transaction(storeName, "readonly");
  return requestToPromise(tx.objectStore(storeName).getAll());
}

async function put(storeName, value) {
  const db = await openDb();
  await transactionDone(db, storeName, "readwrite", (tx) => {
    tx.objectStore(storeName).put(value);
  });
}

async function remove(storeName, id) {
  const db = await openDb();
  await transactionDone(db, storeName, "readwrite", (tx) => {
    tx.objectStore(storeName).delete(id);
  });
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
