const BACKUP_VERSION = 1;

export function exportBackup(state) {
  const backup = {
    app: "PostSnail",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    state,
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
  return backup.state;
}

