import { canonicalJson } from "./canonical.js";
import { encodeText } from "./bytes.js";
import { fingerprintForBytes } from "./crypto.js";

const BACKUP_VERSION = 1;

export function exportBackup(state) {
  const payload = {
    app: "PostSnail",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    state,
  };
  const backup = {
    ...payload,
    backupFingerprint: fingerprintForBytes(encodeText(canonicalJson(payload))),
  };
  return JSON.stringify(backup, null, 2);
}

export function importBackup(text) {
  const backup = JSON.parse(text);
  if (backup.app !== "PostSnail" || backup.version !== BACKUP_VERSION || !backup.state) {
    throw new Error("This is not a PostSnail v1 backup.");
  }
  if (backup.state.identity?.secretKey) {
    throw new Error("Backups must not contain raw private signing keys.");
  }
  if (backup.backupFingerprint) {
    const { backupFingerprint, ...payload } = backup;
    const expected = fingerprintForBytes(encodeText(canonicalJson(payload)));
    if (backupFingerprint !== expected) {
      throw new Error("Backup fingerprint mismatch.");
    }
  }
  return backup.state;
}
