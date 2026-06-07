import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

export async function resolveWorkspacePassphrase(flags = {}, options = {}) {
  const value = readWorkspacePassphrase(flags);
  if (value) return value;
  if (canPrompt(options)) {
    return promptForSecret("Workspace passphrase: ");
  }
  throw new Error("Workspace passphrase is required.");
}

export async function resolveIdentityPassphrase(flags = {}, options = {}) {
  const value = readIdentityPassphrase(flags);
  if (value) return value;
  if (canPrompt(options)) {
    return promptForSecret("Identity passphrase: ");
  }
  throw new Error("Identity passphrase is required.");
}

export function readWorkspacePassphrase(flags = {}) {
  return String(
    flags["workspace-passphrase"]
      || flags.passphrase
      || process.env.POSTSNAIL_WORKSPACE_PASSPHRASE
      || "",
  );
}

export function readIdentityPassphrase(flags = {}) {
  return String(
    flags["identity-passphrase"]
      || process.env.POSTSNAIL_IDENTITY_PASSPHRASE
      || "",
  );
}

async function promptForSecret(prompt) {
  const mutedOutput = new MutedOutput(output);
  const rl = createInterface({
    input,
    output: mutedOutput,
    terminal: true,
  });
  mutedOutput.muted = true;
  try {
    const answer = await rl.question(prompt);
    output.write("\n");
    return String(answer || "");
  } finally {
    mutedOutput.muted = false;
    rl.close();
  }
}

function canPrompt(options = {}) {
  if (options.interactive === false) return false;
  return Boolean(input.isTTY && output.isTTY);
}

class MutedOutput extends Writable {
  constructor(target) {
    super();
    this.target = target;
    this.muted = false;
  }

  _write(chunk, encoding, callback) {
    this.target.write(this.muted ? "*" : chunk, encoding, callback);
  }
}
