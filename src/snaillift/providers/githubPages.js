import { assertSnailLiftSafe } from "../safety.js";

export const githubPagesProvider = {
  id: "github-pages",
  name: "GitHub Pages",
  async deploy({ files, settings = {} } = {}) {
    const safety = assertSnailLiftSafe(files || {});
    const validation = validateGithubPagesSettings(settings);
    if (!validation.ok) {
      return {
        ok: false,
        code: "invalid-github-settings",
        message: validation.errors.join("; "),
        safety,
      };
    }
    return {
      ok: false,
      code: "command-assistant",
      message:
        "GitHub Pages browser deploy is not enabled in SnailLift 1B. Run these commands locally after extracting the public Website ZIP.",
      commands: buildGithubPagesCommands({
        ...validation.normalized,
        directory: settings.directory || "postsnail-public",
      }),
      safety,
    };
  },
};

export function validateGithubPagesSettings(settings = {}) {
  const errors = [];
  const normalized = {
    owner: normalizeName(settings.owner),
    repo: normalizeName(settings.repo),
    branch: normalizeBranch(settings.branch),
    targetDir: normalizeTargetDir(settings.targetDir),
    siteUrl: normalizeHttpsUrl(settings.siteUrl),
  };

  if (!normalized.owner) errors.push("owner is required");
  if (!normalized.repo) errors.push("repo is required");
  if (!normalized.branch) errors.push("branch is invalid");
  if (normalized.targetDir === null) errors.push("targetDir is invalid");
  if (!normalized.siteUrl) errors.push("siteUrl is required");

  return {
    ok: errors.length === 0,
    errors,
    normalized: {
      ...normalized,
      targetDir: normalized.targetDir || ".",
    },
  };
}

export function buildGithubPagesCommands(settings = {}) {
  const validation = validateGithubPagesSettings(settings);
  const normalized = validation.normalized;
  const owner = shellToken(normalized.owner || "<owner>");
  const repo = shellToken(normalized.repo || "<repo>");
  const branch = shellToken(normalized.branch || "gh-pages");
  const directory = shellToken(settings.directory || "postsnail-public");
  const targetDir = normalized.targetDir || ".";
  const targetPath = targetDir === "." ? "./" : `${targetDir}/`;
  const gitAddPath = targetDir === "." ? "." : targetDir;

  return [
    "rm -rf postsnail-github-pages",
    `git clone https://github.com/${owner}/${repo}.git postsnail-github-pages`,
    "cd postsnail-github-pages",
    `git checkout ${branch} || git checkout --orphan ${branch}`,
    `mkdir -p ${shellToken(targetDir)}`,
    `rsync -a --delete ../${directory}/ ${shellToken(targetPath)}`,
    `git add ${shellToken(gitAddPath)}`,
    'git commit -m "Publish PostSnail site" || true',
    `git push origin ${branch}`,
  ];
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function normalizeBranch(value) {
  const branch = String(value || "gh-pages").trim() || "gh-pages";
  return isSafeShellPath(branch) && !branch.includes("..") && !branch.startsWith("/") ? branch : "";
}

function normalizeTargetDir(value) {
  const targetDir = String(value || ".").trim() || ".";
  if (targetDir === ".") return ".";
  if (!isSafeShellPath(targetDir)) return null;
  if (targetDir.startsWith("/") || targetDir.includes("..") || targetDir.split("/").includes(".git")) return null;
  return targetDir.replace(/\/+$/u, "") || ".";
}

function normalizeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return "";
    url.hash = "";
    url.search = "";
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return url.href;
  } catch {
    return "";
  }
}

function isSafeShellPath(value) {
  return /^[A-Za-z0-9._/-]+$/u.test(String(value || ""));
}

function shellToken(value) {
  const text = String(value || "");
  return /^[A-Za-z0-9._/:=-]+$/u.test(text) ? text : JSON.stringify(text);
}
