import { signSiteMoveRecord } from "../../siteMoves.js";
import { verifySnailLiftLiveSite } from "../../snaillift/liveVerifier.js";
import { buildExportFromCliWorkspace } from "./workflow.js";
import { resolveIdentityPassphrase } from "../passphrase.js";
import { cleanText } from "../state.js";
import { unlockWorkspaceIdentity } from "../workspace-node.js";

export async function runDomainCommand(positionals, flags) {
  const subcommand = positionals[0];
  if (!["move", "mirror"].includes(subcommand)) throw new Error("Unknown domain command.");
  const { context, result } = await buildExportFromCliWorkspace(flags);
  const identityPassphrase = await resolveIdentityPassphrase(flags);
  const secretKey = await unlockWorkspaceIdentity(context.state, identityPassphrase);
  const fromUrl = cleanText(flags["from-url"]);
  const toUrl = cleanText(flags["to-url"] || context.state.profile?.siteUrl);
  if (!fromUrl || !toUrl) throw new Error("Both --from-url and --to-url are required.");
  const live = flags["skip-live-verify"]
    ? { ok: true, bundleFingerprint: result.bundleFingerprint }
    : await verifySnailLiftLiveSite({ siteUrl: toUrl, exportResult: result });
  if (!live.ok) throw new Error(`Live verification failed: ${live.errors.join("; ")}`);
  const record = signSiteMoveRecord({
    mode: subcommand === "mirror" ? "mirror" : "move",
    fromUrl,
    toUrl,
    publicKey: context.state.identity.publicKey,
    bundleFingerprint: result.bundleFingerprint,
    createdAt: new Date().toISOString(),
  }, secretKey);
  const forestUrl = cleanText(flags["forest-url"] || "https://forest.postsnail.org").replace(/\/+$/u, "");
  const response = await fetch(`${forestUrl}/api/site-moves`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(record),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || body.message || "Forest could not apply this domain move.");
  const move = {
    id: body.moveId || "",
    status: body.status || (record.mode === "mirror" ? "mirror" : "moved"),
    mode: record.mode,
    fromUrl: body.fromUrl || record.fromUrl,
    toUrl: body.toUrl || record.toUrl,
    publicKey: context.state.identity.publicKey,
    bundleFingerprint: record.bundleFingerprint,
    record,
    createdAt: record.createdAt,
    appliedAt: new Date().toISOString(),
  };
  context.state.siteMoves = [move, ...(context.state.siteMoves || []).filter((item) => item.id !== move.id || !move.id)];
  await context.save();
  process.stdout.write(`Domain ${record.mode === "mirror" ? "mirror saved" : "move saved"}: ${move.fromUrl} -> ${move.toUrl}\n`);
}
