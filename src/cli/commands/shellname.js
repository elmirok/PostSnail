import { buildShellNamePayload, signShellNameRecord } from "../../shellnames.js";
import { buildFromWorkspaceState } from "../public-site.js";
import { resolveIdentityPassphrase } from "../passphrase.js";
import { cleanText, openCliWorkspace } from "../state.js";
import { unlockWorkspaceIdentity } from "../workspace-node.js";

export async function runShellNameCommand(positionals, flags) {
  const action = positionals[0];
  if (!["register", "update", "renew"].includes(action)) throw new Error("Unknown shellname command.");
  const context = await openCliWorkspace(flags);
  const identityPassphrase = await resolveIdentityPassphrase(flags);
  const secretKey = await unlockWorkspaceIdentity(context.state, identityPassphrase);
  const name = cleanText(flags.name || context.state.profile?.handle);
  const forestUrl = cleanText(flags["forest-url"] || "https://forest.postsnail.org");
  const exportResult = await buildFromWorkspaceState(context.state, identityPassphrase);
  const payload = buildShellNamePayload({
    name,
    forest: forestUrl,
    siteUrl: cleanText(flags["site-url"] || context.state.profile?.siteUrl),
    publicKey: context.state.identity.publicKey,
    bundleFingerprint: exportResult.bundleFingerprint,
    [action === "update" ? "updatedAt" : "createdAt"]: new Date().toISOString(),
  });
  const record = signShellNameRecord(payload, secretKey);
  const endpoint = `${forestUrl.replace(/\/+$/u, "")}/shellnames/${action}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, record }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || body.message || "Forest could not save this ShellName.");
  const saved = {
    forest: body.forest || new URL(forestUrl).hostname,
    name: body.name || name,
    fullName: body.fullName || `@${name}@${new URL(forestUrl).hostname}`,
    record: body.record || record,
    siteUrl: body.siteUrl || record.siteUrl,
    publicKey: body.publicKey || context.state.identity.publicKey,
    bundleFingerprint: body.bundleFingerprint || record.bundleFingerprint || "",
    status: body.status || "active",
    expiresAt: body.expiresAt || "",
    updatedAt: body.updatedAt || new Date().toISOString(),
  };
  context.state.shellNames = [saved, ...(context.state.shellNames || []).filter((item) => item.name !== saved.name || item.forest !== saved.forest)];
  context.state.commitHistory = exportResult.commitHistory;
  await context.save();
  process.stdout.write(`ShellName saved: ${saved.fullName}\n`);
}
