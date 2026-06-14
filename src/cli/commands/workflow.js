import { announceForestAfterLiveVerification } from "../../snaillift/forestAnnounce.js";
import { verifySnailLiftLiveSite } from "../../snaillift/liveVerifier.js";
import { surgeProvider } from "../../snaillift/providers/surge.js";
import { buildFromWorkspaceState } from "../public-site.js";
import { resolveIdentityPassphrase } from "../passphrase.js";
import { cleanText, openCliWorkspace } from "../state.js";

export async function buildExportFromCliWorkspace(flags = {}) {
  const context = await openCliWorkspace(flags);
  const identityPassphrase = await resolveIdentityPassphrase(flags);
  const result = await buildFromWorkspaceState(context.state, identityPassphrase);
  context.state.commitHistory = result.commitHistory;
  await context.save();
  return { context, result };
}

export async function runPublishCommand(positionals, flags) {
  const provider = positionals[0];
  if (provider !== "surge") throw new Error("Unknown publish provider.");
  const { context, result } = await buildExportFromCliWorkspace(flags);
  const settings = {
    siteUrl: cleanText(flags["site-url"] || context.state.settings?.snailLiftSurgeSiteUrl || context.state.profile?.siteUrl),
    domain: cleanText(flags.domain || context.state.settings?.snailLiftSurgeDomain),
    projectDir: cleanText(flags["project-dir"] || context.state.settings?.snailLiftSurgeProjectDir || "postsnail-public"),
    surgeLogin: cleanText(flags["surge-login"] || context.state.settings?.snailLiftSurgeLogin || process.env.SURGE_LOGIN),
    surgeToken: cleanText(flags["surge-token"] || context.state.settings?.snailLiftSurgeToken || process.env.SURGE_TOKEN),
    bridgeUrl: cleanText(flags["bridge-url"] || ""),
  };
  const deploy = await surgeProvider.deploy({
    zipBytes: result.zipBytes,
    files: result.files,
    settings,
  });
  if (!deploy.ok) throw new Error(deploy.message || "Surge publish failed.");
  const live = flags["skip-live-verify"]
    ? { ok: true, bundleFingerprint: result.bundleFingerprint }
    : await verifySnailLiftLiveSite({ siteUrl: settings.siteUrl, exportResult: result });
  if (!live.ok) throw new Error(`Live verification failed: ${live.errors.join("; ")}`);
  let announce = null;
  if (flags["notify-forest"] || flags.announce) {
    if (flags["skip-live-verify"]) {
      throw new Error("Forest notify requires live verification.");
    }
    announce = await announceForestAfterLiveVerification({
      liveVerification: live,
      announcePayload: result.announcePayload,
      forestAnnounceUrl: forestAnnounceUrl(flags["forest-url"] || flags.forest),
    });
    if (!announce.ok) throw new Error(announce.message || "Forest announce failed.");
  }
  process.stdout.write([
    "Surge publish verified.",
    `Bundle fingerprint: ${result.bundleFingerprint}`,
    announce ? `Forest: ${announce.message}` : "",
    "",
  ].filter(Boolean).join("\n"));
}

export async function runForestCommand(positionals, flags) {
  const subcommand = positionals[0];
  if (subcommand !== "announce") throw new Error("Unknown forest command.");
  const { result } = await buildExportFromCliWorkspace(flags);
  const live = flags["skip-live-verify"]
    ? { ok: true }
    : await verifySnailLiftLiveSite({
        siteUrl: cleanText(flags["site-url"] || result.manifest?.site?.siteUrl),
        exportResult: result,
      });
  const announce = await announceForestAfterLiveVerification({
    liveVerification: live,
    announcePayload: result.announcePayload,
    forestAnnounceUrl: forestAnnounceUrl(flags["forest-url"] || flags.forest),
  });
  if (!announce.ok) throw new Error(announce.message || "Forest announce failed.");
  process.stdout.write(`Forest announce: ${announce.message}\n`);
}

export function forestAnnounceUrl(value) {
  const base = cleanText(value || "https://forest.postsnail.org");
  if (base.endsWith("/api/announce")) return base;
  return `${base.replace(/\/+$/u, "")}/api/announce`;
}
