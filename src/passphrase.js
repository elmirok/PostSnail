export const MIN_PASSPHRASE_LENGTH = 10;

export function assertStrongPassphrase(passphrase, label = "Passphrase") {
  const value = String(passphrase ?? "");
  if (!value.trim()) {
    throw new Error(`${label} is required.`);
  }
  if (value.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`${label} must be at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  }
}
