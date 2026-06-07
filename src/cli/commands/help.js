export function renderHelp() {
  return [
    "PostSnail CLI",
    "",
    "Commands:",
    "  workspace info --workspace <file.postsnail>",
    "  workspace migrate --workspace <file.postsnail> --out <new-file.postsnail>",
    "  post import <draft.md> --workspace <file.postsnail>",
    "  build --workspace <file.postsnail> --out <public-dir>",
    "  verify <public-dir-or-zip>",
    "  zip --workspace <file.postsnail> --out <site.zip>",
    "",
  ].join("\n");
}

