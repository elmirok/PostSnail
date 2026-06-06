import { validatePublicExportFiles } from "../core/export/safety.js";

export function runSnailLiftSafety(files) {
  const result = validatePublicExportFiles(files);
  return {
    ok: result.ok,
    errors: result.errors,
    warnings: result.warnings,
    fileCount: result.fileCount,
  };
}

export function assertSnailLiftSafe(files) {
  const result = runSnailLiftSafety(files);
  if (!result.ok) {
    throw new Error(`SnailLift safety check failed: ${result.errors.join("; ")}`);
  }
  return result;
}
