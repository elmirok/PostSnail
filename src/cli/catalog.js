export const CLI_COMMANDS = [
  { group: "Shell setup", usage: "postsnail workspace create --workspace <file.postsnail>", summary: "Create a new encrypted Shell file." },
  { group: "Shell setup", usage: "postsnail workspace info --workspace <file.postsnail>", summary: "Show Shell profile, post, and asset counts." },
  { group: "Shell setup", usage: "postsnail workspace migrate --workspace <file.postsnail> --out <file.postsnail>", summary: "Rewrite a Shell with the current workspace schema." },
  { group: "Identity and profile", usage: "postsnail profile show --workspace <file.postsnail>", summary: "Print public profile metadata." },
  { group: "Identity and profile", usage: "postsnail profile set --workspace <file.postsnail>", summary: "Update profile fields." },
  { group: "Identity and profile", usage: "postsnail identity generate --workspace <file.postsnail>", summary: "Create an encrypted ML-DSA-65 publisher key." },
  { group: "Identity and profile", usage: "postsnail identity show --workspace <file.postsnail>", summary: "Print public identity metadata." },
  { group: "Pages, navigation, and plugins", usage: "postsnail plugin list --workspace <file.postsnail>", summary: "List official bundled plugins." },
  { group: "Pages, navigation, and plugins", usage: "postsnail plugin enable <plugin-id> --workspace <file.postsnail>", summary: "Install and enable an official bundled plugin." },
  { group: "Pages, navigation, and plugins", usage: "postsnail plugin disable <plugin-id> --workspace <file.postsnail>", summary: "Disable an installed plugin without deleting state." },
  { group: "Write and manage content", usage: "postsnail post list --workspace <file.postsnail>", summary: "List posts." },
  { group: "Write and manage content", usage: "postsnail post new --workspace <file.postsnail>", summary: "Create or update a post from flags." },
  { group: "Write and manage content", usage: "postsnail post import <draft.md> --workspace <file.postsnail>", summary: "Import a frontmatter Markdown post." },
  { group: "Write and manage content", usage: "postsnail post status --workspace <file.postsnail> --slug <slug> --status <draft|published>", summary: "Change a post status." },
  { group: "Write and manage content", usage: "postsnail post delete --workspace <file.postsnail> --slug <slug>", summary: "Delete a post by slug." },
  { group: "Pages, navigation, and plugins", usage: "postsnail page list --workspace <file.postsnail>", summary: "List Pages plugin pages and docs." },
  { group: "Pages, navigation, and plugins", usage: "postsnail page import <page.md> --workspace <file.postsnail>", summary: "Import a page or doc from Markdown." },
  { group: "Pages, navigation, and plugins", usage: "postsnail page status --workspace <file.postsnail> --slug <slug> --status <draft|published|archived>", summary: "Change page or doc status." },
  { group: "Pages, navigation, and plugins", usage: "postsnail page delete --workspace <file.postsnail> --slug <slug>", summary: "Delete a page or doc." },
  { group: "Pages, navigation, and plugins", usage: "postsnail page navigation --workspace <file.postsnail>", summary: "Replace navigation from a JSON file." },
  { group: "Images and cleanup", usage: "postsnail asset list --workspace <file.postsnail>", summary: "List image/assets in the Shell." },
  { group: "Images and cleanup", usage: "postsnail asset unused --workspace <file.postsnail>", summary: "Show unused assets." },
  { group: "Images and cleanup", usage: "postsnail asset delete-unused --workspace <file.postsnail>", summary: "Remove assets not referenced anywhere." },
  { group: "Comments moderation", usage: "postsnail comment verify <comment.json>", summary: "Verify a signed comment packet." },
  { group: "Comments moderation", usage: "postsnail comment approve <comment.json> --workspace <file.postsnail>", summary: "Approve a signed comment into the Shell." },
  { group: "Comments moderation", usage: "postsnail comment reject <comment.json> --workspace <file.postsnail>", summary: "Reject a signed comment into private moderation state." },
  { group: "Comments moderation", usage: "postsnail comment list --workspace <file.postsnail>", summary: "List approved, rejected, and blocked comment state." },
  { group: "Comments moderation", usage: "postsnail comment block-key --workspace <file.postsnail> --public-key <base64:...>", summary: "Block a comment author public key." },
  { group: "Build, ZIP, and verify", usage: "postsnail build --workspace <file.postsnail> --out <public-dir>", summary: "Build public static files." },
  { group: "Build, ZIP, and verify", usage: "postsnail zip --workspace <file.postsnail> --out <site.zip>", summary: "Export the signed public Website ZIP." },
  { group: "Build, ZIP, and verify", usage: "postsnail verify <public-dir-or-zip>", summary: "Verify a public directory or ZIP." },
  { group: "Build, ZIP, and verify", usage: "postsnail live verify --site-url <https://site/>", summary: "Verify live public proof files." },
  { group: "Publish with Surge", usage: "postsnail publish surge --workspace <file.postsnail>", summary: "Publish through the local Surge bridge." },
  { group: "Forest, ShellNames, and Change Domain", usage: "postsnail forest announce --workspace <file.postsnail>", summary: "Send the signed public announce to Forest." },
  { group: "Forest, ShellNames, and Change Domain", usage: "postsnail shellname register --workspace <file.postsnail> --name <name>", summary: "Claim a Forest ShellName." },
  { group: "Forest, ShellNames, and Change Domain", usage: "postsnail shellname update --workspace <file.postsnail> --name <name>", summary: "Update a Forest ShellName." },
  { group: "Forest, ShellNames, and Change Domain", usage: "postsnail shellname renew --workspace <file.postsnail> --name <name>", summary: "Renew a Forest ShellName." },
  { group: "Forest, ShellNames, and Change Domain", usage: "postsnail domain move --workspace <file.postsnail> --from-url <old> --to-url <new>", summary: "Hide an old indexed domain after a signed move." },
  { group: "Forest, ShellNames, and Change Domain", usage: "postsnail domain mirror --workspace <file.postsnail> --from-url <old> --to-url <new>", summary: "Record an old domain as a mirror." },
];

export function getCliCommandCatalog() {
  return CLI_COMMANDS.map((command) => ({ ...command }));
}

export function groupedCliCommands() {
  const groups = new Map();
  for (const command of CLI_COMMANDS) {
    if (!groups.has(command.group)) groups.set(command.group, []);
    groups.get(command.group).push({ ...command });
  }
  return [...groups.entries()].map(([name, commands]) => ({ name, commands }));
}
