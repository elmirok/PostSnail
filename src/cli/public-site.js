import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { textToBytes } from "../crypto.js";
import { buildStaticExport } from "../exporter.js";
import { unlockWorkspaceIdentity } from "./workspace-node.js";

export async function buildFromWorkspaceState(state, identityPassphrase) {
  if (!state?.identity?.publicKey) {
    throw new Error("Generate or import a signing identity before building a public site.");
  }
  const secretKey = await unlockWorkspaceIdentity(state, identityPassphrase);
  return buildStaticExport({
    profile: state.profile,
    posts: state.posts,
    assets: state.assets,
    settings: state.settings,
    commitHistory: state.commitHistory,
    plugins: state.plugins,
    moderation: state.moderation,
    appearance: state.appearance,
    shellNames: state.shellNames,
    publicKey: textToBytes(state.identity.publicKey),
    secretKey,
  });
}

export async function writePublicFiles(outDir, files) {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  for (const [relativePath, bytes] of Object.entries(files || {})) {
    const fullPath = join(outDir, relativePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, bytes);
  }
}

export async function writeZipFile(outPath, zipBytes) {
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, zipBytes);
}

