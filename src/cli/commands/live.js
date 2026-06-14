import { verifyRemoteSite } from "../../remote-verifier.js";
import { verifySnailLiftLiveSite } from "../../snaillift/liveVerifier.js";
import { buildFromWorkspaceState } from "../public-site.js";
import { resolveIdentityPassphrase } from "../passphrase.js";
import { cleanText, openCliWorkspace } from "../state.js";

export async function runLiveCommand(positionals, flags) {
  const subcommand = positionals[0];
  if (subcommand !== "verify") throw new Error("Unknown live command.");
  const siteUrl = cleanText(flags["site-url"] || flags.url || positionals[1]);
  if (!siteUrl) throw new Error("Site URL is required.");

  if (flags.workspace) {
    const context = await openCliWorkspace(flags);
    const identityPassphrase = await resolveIdentityPassphrase(flags);
    const exportResult = await buildFromWorkspaceState(context.state, identityPassphrase);
    const result = await verifySnailLiftLiveSite({ siteUrl, exportResult });
    if (!result.ok) throw new Error(`Live verification failed: ${result.errors.join("; ")}`);
    process.stdout.write(`Live verified ${result.bundleFingerprint}\n`);
    return;
  }

  const result = await verifyRemoteSite(siteUrl);
  if (!result.ok) throw new Error(`Live verification failed: ${result.checks.filter((check) => !check.ok).map((check) => check.error || check.label).join("; ")}`);
  process.stdout.write(`Live verified ${result.summary.bundleFingerprint}\n`);
}
