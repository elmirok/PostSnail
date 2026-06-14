import { encryptSecretKey, generateSigningKeyPair, publicKeyToText } from "../../crypto.js";
import { resolveIdentityPassphrase } from "../passphrase.js";
import { openCliWorkspace, printJson } from "../state.js";

export async function runIdentityCommand(positionals, flags) {
  const subcommand = positionals[0];
  if (!["generate", "show"].includes(subcommand)) throw new Error("Unknown identity command.");
  const context = await openCliWorkspace(flags);

  if (subcommand === "show") {
    printJson({
      algorithm: context.state.identity?.algorithm || "",
      publicKey: context.state.identity?.publicKey || "",
      createdAt: context.state.identity?.createdAt || "",
    });
    return;
  }

  if (context.state.identity?.encryptedSecretKey && !flags.force) {
    throw new Error("This Shell already has an identity. Pass --force to replace it.");
  }
  const identityPassphrase = await resolveIdentityPassphrase(flags);
  const keys = generateSigningKeyPair();
  context.state.identity = {
    algorithm: "ML-DSA-65",
    publicKey: publicKeyToText(keys.publicKey),
    encryptedSecretKey: await encryptSecretKey(keys.secretKey, identityPassphrase),
    createdAt: new Date().toISOString(),
  };
  await context.save();
  process.stdout.write(`Public key: ${context.state.identity.publicKey}\n`);
}
