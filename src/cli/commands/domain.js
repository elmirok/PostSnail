import { signSiteMoveRecord } from "../../siteMoves.js";
import { buildMovedShellNameUpdate, findShellNameForMove, shellNameFromForestResponse } from "../../domainMoveShellName.js";
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
    : await verifySnailLiftLiveSite({ siteUrl: toUrl, expectedPublicKey: context.state.identity.publicKey });
  if (!live.ok) throw new Error(`Live verification failed: ${live.errors.join("; ")}`);
  const record = signSiteMoveRecord({
    mode: subcommand === "mirror" ? "mirror" : "move",
    fromUrl,
    toUrl,
    publicKey: context.state.identity.publicKey,
    bundleFingerprint: live.bundleFingerprint || result.bundleFingerprint,
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
  let shellNameMessage = "";
  if (record.mode === "move") {
    const shellName = findShellNameForMove(context.state.shellNames, {
      forestUrl,
      publicKey: context.state.identity.publicKey,
      name: flags.shellname || flags.name,
    });
    const shellNameUpdate = shellName
      ? buildMovedShellNameUpdate({
        shellName,
        forestUrl,
        toUrl: move.toUrl,
        publicKey: context.state.identity.publicKey,
        bundleFingerprint: record.bundleFingerprint,
        secretKey,
      })
      : null;
    if (shellNameUpdate) {
      const shellNameResponse = await fetch(`${forestUrl}/shellnames/update`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(shellNameUpdate),
      });
      const shellNameBody = await shellNameResponse.json().catch(() => ({}));
      if (shellNameResponse.ok) {
        const savedShellName = shellNameFromForestResponse({
          result: shellNameBody,
          record: shellNameUpdate.record,
          shellName,
          forestUrl,
          publicKey: context.state.identity.publicKey,
        });
        context.state.shellNames = [savedShellName, ...(context.state.shellNames || []).filter((item) => item.name !== savedShellName.name || item.forest !== savedShellName.forest)];
        shellNameMessage = `ShellName alias updated: ${savedShellName.fullName} -> ${savedShellName.siteUrl}\n`;
      } else {
        shellNameMessage = `ShellName alias update needs attention: ${shellNameBody.error || shellNameBody.message || "Forest could not update this ShellName."}\n`;
      }
    }
  }
  await context.save();
  process.stdout.write(`Domain ${record.mode === "mirror" ? "mirror saved" : "move saved"}: ${move.fromUrl} -> ${move.toUrl}\n`);
  if (shellNameMessage) process.stdout.write(shellNameMessage);
}
