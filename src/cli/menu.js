import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

import { groupedCliCommands } from "./catalog.js";

const MAIN_ITEMS = [
  "Start local Admin + Bridge",
  "Shell setup",
  "Identity and profile",
  "Write and manage content",
  "Pages, navigation, and plugins",
  "Images and cleanup",
  "Build, ZIP, and verify",
  "Publish with Surge",
  "Forest, ShellNames, and Change Domain",
  "Comments moderation",
  "Learn CLI commands",
];

const COMMON = {
  workspace: { name: "workspace", label: "Shell path", defaultKey: "selectedWorkspace", required: true, rememberWorkspace: true },
  shellPassphrase: { name: "passphrase", label: "Shell passphrase", secretKey: "workspacePassphrase", required: true },
  identityPassphrase: { name: "identity-passphrase", label: "Identity passphrase", secretKey: "identityPassphrase", required: true },
};

const TUI_ACTIONS = [
  action("Shell setup", "Create Shell", "postsnail workspace create --workspace <file.postsnail>", "Creates a new encrypted .postsnail Shell.", "Creates private encrypted Shell data locally. The passphrase is kept only in this TUI session.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
    { name: "site-title", label: "Site title", defaultValue: "Untitled PostSnail" },
    { name: "handle", label: "Handle" },
    { name: "site-url", label: "Site URL" },
    { name: "description", label: "Description" },
  ], (v) => withFlags(["workspace", "create"], v, ["workspace", "passphrase", "site-title", "handle", "site-url", "description"])),
  action("Shell setup", "Open Shell Info", "postsnail workspace info --workspace <file.postsnail>", "Shows public profile counts from an encrypted Shell.", "Opens the encrypted Shell locally. No public files are written.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
  ], (v) => withFlags(["workspace", "info"], v, ["workspace", "passphrase"])),
  action("Shell setup", "Migrate Shell", "postsnail workspace migrate --workspace <file.postsnail> --out <file.postsnail>", "Rewrites a Shell with the current workspace schema.", "Reads and writes encrypted Shell files only. It does not publish anything.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
    { name: "out", label: "Output Shell path", defaultKey: "selectedWorkspace" },
  ], (v) => withFlags(["workspace", "migrate"], v, ["workspace", "passphrase", "out"])),

  action("Identity and profile", "Show Profile", "postsnail profile show --workspace <file.postsnail>", "Prints public profile metadata.", "Reads the encrypted Shell locally.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
  ], (v) => withFlags(["profile", "show"], v, ["workspace", "passphrase"])),
  action("Identity and profile", "Set Profile", "postsnail profile set --workspace <file.postsnail>", "Updates profile fields inside the encrypted Shell.", "Writes only the encrypted Shell. Nothing is published.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
    { name: "site-title", label: "Site title" },
    { name: "handle", label: "Handle" },
    { name: "site-url", label: "Site URL" },
    { name: "description", label: "Description" },
    { name: "bio", label: "Bio" },
    { name: "author", label: "Author" },
  ], (v) => withFlags(["profile", "set"], v, ["workspace", "passphrase", "site-title", "handle", "site-url", "description", "bio", "author"])),
  action("Identity and profile", "Generate Identity", "postsnail identity generate --workspace <file.postsnail>", "Creates an encrypted ML-DSA-65 publisher key.", "The private signing key is encrypted inside the Shell. The raw key is never printed.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
    COMMON.identityPassphrase,
  ], (v) => withFlags(["identity", "generate"], v, ["workspace", "passphrase", "identity-passphrase"])),
  action("Identity and profile", "Show Identity", "postsnail identity show --workspace <file.postsnail>", "Shows public identity metadata.", "Prints public key metadata only, never the private key.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
  ], (v) => withFlags(["identity", "show"], v, ["workspace", "passphrase"])),

  action("Write and manage content", "List Posts", "postsnail post list --workspace <file.postsnail>", "Lists posts in the Shell.", "Reads encrypted Shell content locally.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
  ], (v) => withFlags(["post", "list"], v, ["workspace", "passphrase"])),
  action("Write and manage content", "New Or Update Post", "postsnail post new --workspace <file.postsnail>", "Creates or updates a post from guided fields.", "Writes editable post data into the encrypted Shell. Drafts remain private.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
    { name: "title", label: "Post title", defaultValue: "Untitled post" },
    { name: "slug", label: "Slug" },
    { name: "body", label: "Markdown body" },
    { name: "status", label: "Status", defaultValue: "draft" },
    { name: "tags", label: "Tags, comma-separated" },
  ], (v) => withFlags(["post", "new"], v, ["workspace", "passphrase", "title", "slug", "body", "status", "tags"])),
  action("Write and manage content", "Import Markdown Post", "postsnail post import <draft.md> --workspace <file.postsnail>", "Imports a Markdown file with frontmatter.", "Reads a local Markdown file and writes the encrypted Shell.", [
    { name: "markdown", label: "Markdown file path", required: true },
    COMMON.workspace,
    COMMON.shellPassphrase,
  ], (v) => withFlags(["post", "import", v.markdown], v, ["workspace", "passphrase"])),
  action("Write and manage content", "Change Post Status", "postsnail post status --workspace <file.postsnail> --slug <slug> --status <draft|published>", "Changes a post between draft and published.", "Only published posts are exported to the public ZIP.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
    { name: "slug", label: "Post slug", required: true },
    { name: "status", label: "Status", defaultValue: "draft" },
  ], (v) => withFlags(["post", "status"], v, ["workspace", "passphrase", "slug", "status"])),
  action("Write and manage content", "Delete Post", "postsnail post delete --workspace <file.postsnail> --slug <slug>", "Deletes a post from the encrypted Shell.", "This changes private editable Shell data only.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
    { name: "slug", label: "Post slug", required: true },
  ], (v) => withFlags(["post", "delete"], v, ["workspace", "passphrase", "slug"])),

  action("Pages, navigation, and plugins", "List Plugins", "postsnail plugin list --workspace <file.postsnail>", "Lists official bundled plugins.", "Reads plugin state from the encrypted Shell.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
  ], (v) => withFlags(["plugin", "list"], v, ["workspace", "passphrase"])),
  action("Pages, navigation, and plugins", "Enable Plugin", "postsnail plugin enable <plugin-id> --workspace <file.postsnail>", "Installs and enables an official bundled plugin.", "Preserves plugin state inside the encrypted Shell.", [
    { name: "plugin-id", label: "Plugin ID", defaultValue: "postsnail-pages", required: true },
    COMMON.workspace,
    COMMON.shellPassphrase,
  ], (v) => withFlags(["plugin", "enable", v["plugin-id"]], v, ["workspace", "passphrase"])),
  action("Pages, navigation, and plugins", "Disable Plugin", "postsnail plugin disable <plugin-id> --workspace <file.postsnail>", "Disables a plugin without deleting its state.", "Private plugin state stays encrypted in the Shell.", [
    { name: "plugin-id", label: "Plugin ID", defaultValue: "postsnail-pages", required: true },
    COMMON.workspace,
    COMMON.shellPassphrase,
  ], (v) => withFlags(["plugin", "disable", v["plugin-id"]], v, ["workspace", "passphrase"])),
  action("Pages, navigation, and plugins", "List Pages", "postsnail page list --workspace <file.postsnail>", "Lists Pages plugin content.", "Reads encrypted Pages plugin state locally.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
  ], (v) => withFlags(["page", "list"], v, ["workspace", "passphrase"])),
  action("Pages, navigation, and plugins", "Import Page Or Doc", "postsnail page import <page.md> --workspace <file.postsnail>", "Imports a page or doc from Markdown.", "Draft and archived pages remain private.", [
    { name: "markdown", label: "Markdown file path", required: true },
    COMMON.workspace,
    COMMON.shellPassphrase,
  ], (v) => withFlags(["page", "import", v.markdown], v, ["workspace", "passphrase"])),
  action("Pages, navigation, and plugins", "Change Page Status", "postsnail page status --workspace <file.postsnail> --slug <slug> --status <draft|published|archived>", "Changes a page or doc status.", "Only published Pages/Docs are exported.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
    { name: "slug", label: "Page/doc slug", required: true },
    { name: "status", label: "Status", defaultValue: "draft" },
  ], (v) => withFlags(["page", "status"], v, ["workspace", "passphrase", "slug", "status"])),
  action("Pages, navigation, and plugins", "Delete Page", "postsnail page delete --workspace <file.postsnail> --slug <slug>", "Deletes a page or doc from the Shell.", "Changes encrypted plugin state only.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
    { name: "slug", label: "Page/doc slug", required: true },
  ], (v) => withFlags(["page", "delete"], v, ["workspace", "passphrase", "slug"])),
  action("Pages, navigation, and plugins", "Replace Navigation", "postsnail page navigation --workspace <file.postsnail>", "Replaces navigation from a JSON file.", "Writes navigation into encrypted Pages plugin state.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
    { name: "file", label: "Navigation JSON file path", required: true },
  ], (v) => withFlags(["page", "navigation"], v, ["workspace", "passphrase", "file"])),

  action("Images and cleanup", "List Assets", "postsnail asset list --workspace <file.postsnail>", "Lists image/assets in the Shell.", "Reads encrypted Shell assets locally.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
  ], (v) => withFlags(["asset", "list"], v, ["workspace", "passphrase"])),
  action("Images and cleanup", "Find Unused Assets", "postsnail asset unused --workspace <file.postsnail>", "Shows assets not referenced anywhere.", "Does not delete anything.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
  ], (v) => withFlags(["asset", "unused"], v, ["workspace", "passphrase"])),
  action("Images and cleanup", "Delete Unused Assets", "postsnail asset delete-unused --workspace <file.postsnail>", "Removes assets not referenced anywhere.", "Deletes from the encrypted Shell only, not from published sites already online.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
  ], (v) => withFlags(["asset", "delete-unused"], v, ["workspace", "passphrase"])),

  action("Build, ZIP, and verify", "Build Public Website Folder", "postsnail build --workspace <file.postsnail> --out <public-dir>", "Builds public static files.", "Writes only public files; no .postsnail, drafts, raw keys, rejected comments, or private plugin state.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
    COMMON.identityPassphrase,
    { name: "out", label: "Output public directory", defaultValue: "postsnail-public" },
  ], (v) => withFlags(["build"], v, ["workspace", "passphrase", "identity-passphrase", "out"])),
  action("Build, ZIP, and verify", "Export signed Website ZIP", "postsnail zip --workspace <file.postsnail> --out <site.zip>", "Builds the public static Website ZIP.", "Safe to upload. Does not include private Shell data.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
    COMMON.identityPassphrase,
    { name: "out", label: "Output ZIP path", defaultValue: "site.zip" },
  ], (v) => withFlags(["zip"], v, ["workspace", "passphrase", "identity-passphrase", "out"])),
  action("Build, ZIP, and verify", "Verify Folder Or ZIP", "postsnail verify <public-dir-or-zip>", "Verifies a public folder or ZIP.", "Reads public proof files only.", [
    { name: "target", label: "Public folder or ZIP path", required: true },
  ], (v) => ["verify", v.target]),
  action("Build, ZIP, and verify", "Verify Live Site URL", "postsnail live verify --site-url <https://site/>", "Verifies live public proof files.", "Fetches public proof files only.", [
    { name: "site-url", label: "Live site URL", required: true },
  ], (v) => withFlags(["live", "verify"], v, ["site-url"])),

  action("Publish with Surge", "Publish With Surge", "postsnail publish surge --workspace <file.postsnail>", "Publishes through the local Surge bridge.", "Uploads generated public files only. Surge token is not printed and must not enter the public ZIP.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
    COMMON.identityPassphrase,
    { name: "site-url", label: "Live site URL" },
    { name: "domain", label: "Surge domain" },
    { name: "project-dir", label: "Project directory", defaultValue: "postsnail-public" },
    { name: "surge-login", label: "Surge login" },
    { name: "surge-token", label: "Surge token", secretKey: "surgeToken" },
    { name: "bridge-url", label: "Bridge URL", defaultValue: "http://127.0.0.1:8788" },
    { name: "notify-forest", label: "Notify Forest after live verification? (y/N)" },
  ], (v) => {
    const args = withFlags(["publish", "surge"], v, ["workspace", "passphrase", "identity-passphrase", "site-url", "domain", "project-dir", "surge-login", "surge-token", "bridge-url"]);
    if (isYes(v["notify-forest"])) args.push("--notify-forest");
    return args;
  }),

  action("Forest, ShellNames, and Change Domain", "Notify Forest", "postsnail forest announce --workspace <file.postsnail>", "Sends a signed public announce to remote Forest.", "Sends public proof metadata only. No Shell vault, passphrase, or private key is sent.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
    COMMON.identityPassphrase,
    { name: "site-url", label: "Live site URL" },
    { name: "forest-url", label: "Forest URL", defaultValue: "https://forest.postsnail.org" },
  ], (v) => withFlags(["forest", "announce"], v, ["workspace", "passphrase", "identity-passphrase", "site-url", "forest-url"])),
  action("Forest, ShellNames, and Change Domain", "Register ShellName", "postsnail shellname register --workspace <file.postsnail> --name <name>", "Claims a Forest ShellName.", "Sends a public signed alias record only.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
    COMMON.identityPassphrase,
    { name: "name", label: "ShellName", required: true },
    { name: "forest-url", label: "Forest URL", defaultValue: "https://forest.postsnail.org" },
  ], (v) => withFlags(["shellname", "register"], v, ["workspace", "passphrase", "identity-passphrase", "name", "forest-url"])),
  action("Forest, ShellNames, and Change Domain", "Update ShellName", "postsnail shellname update --workspace <file.postsnail> --name <name>", "Updates a Forest ShellName.", "Sends a public signed alias record only.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
    COMMON.identityPassphrase,
    { name: "name", label: "ShellName", required: true },
    { name: "forest-url", label: "Forest URL", defaultValue: "https://forest.postsnail.org" },
  ], (v) => withFlags(["shellname", "update"], v, ["workspace", "passphrase", "identity-passphrase", "name", "forest-url"])),
  action("Forest, ShellNames, and Change Domain", "Renew ShellName", "postsnail shellname renew --workspace <file.postsnail> --name <name>", "Renews a Forest ShellName.", "Sends a public signed alias record only.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
    COMMON.identityPassphrase,
    { name: "name", label: "ShellName", required: true },
    { name: "forest-url", label: "Forest URL", defaultValue: "https://forest.postsnail.org" },
  ], (v) => withFlags(["shellname", "renew"], v, ["workspace", "passphrase", "identity-passphrase", "name", "forest-url"])),
  action("Forest, ShellNames, and Change Domain", "Move Domain", "postsnail domain move --workspace <file.postsnail> --from-url <old> --to-url <new>", "Hides an old indexed domain after a signed move.", "Sends a public signed move record after live verification.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
    COMMON.identityPassphrase,
    { name: "from-url", label: "Old site URL", required: true },
    { name: "to-url", label: "New site URL", required: true },
    { name: "forest-url", label: "Forest URL", defaultValue: "https://forest.postsnail.org" },
  ], (v) => withFlags(["domain", "move"], v, ["workspace", "passphrase", "identity-passphrase", "from-url", "to-url", "forest-url"])),
  action("Forest, ShellNames, and Change Domain", "Mark Mirror Domain", "postsnail domain mirror --workspace <file.postsnail> --from-url <old> --to-url <new>", "Keeps both domains visible as mirrors.", "Sends a public signed mirror record after live verification.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
    COMMON.identityPassphrase,
    { name: "from-url", label: "Old site URL", required: true },
    { name: "to-url", label: "New site URL", required: true },
    { name: "forest-url", label: "Forest URL", defaultValue: "https://forest.postsnail.org" },
  ], (v) => withFlags(["domain", "mirror"], v, ["workspace", "passphrase", "identity-passphrase", "from-url", "to-url", "forest-url"])),

  action("Comments moderation", "Verify Comment Packet", "postsnail comment verify <comment.json>", "Verifies a signed comment packet.", "Reads a public comment packet only.", [
    { name: "comment", label: "Comment JSON file path", required: true },
  ], (v) => ["comment", "verify", v.comment]),
  action("Comments moderation", "Approve Comment", "postsnail comment approve <comment.json> --workspace <file.postsnail>", "Approves a signed comment into the Shell.", "Approved comments can be exported publicly later.", [
    { name: "comment", label: "Comment JSON file path", required: true },
    COMMON.workspace,
    COMMON.shellPassphrase,
  ], (v) => withFlags(["comment", "approve", v.comment], v, ["workspace", "passphrase"])),
  action("Comments moderation", "Reject Comment", "postsnail comment reject <comment.json> --workspace <file.postsnail>", "Rejects a signed comment into private moderation state.", "Rejected comments stay private in the encrypted Shell.", [
    { name: "comment", label: "Comment JSON file path", required: true },
    COMMON.workspace,
    COMMON.shellPassphrase,
  ], (v) => withFlags(["comment", "reject", v.comment], v, ["workspace", "passphrase"])),
  action("Comments moderation", "List Comment State", "postsnail comment list --workspace <file.postsnail>", "Lists approved, rejected, and blocked comment state.", "Reads private moderation state from the encrypted Shell.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
  ], (v) => withFlags(["comment", "list"], v, ["workspace", "passphrase"])),
  action("Comments moderation", "Block Comment Author Key", "postsnail comment block-key --workspace <file.postsnail> --public-key <base64:...>", "Blocks a comment author public key.", "Stores the blocked public key in private Shell moderation state.", [
    COMMON.workspace,
    COMMON.shellPassphrase,
    { name: "public-key", label: "Author public key", required: true },
  ], (v) => withFlags(["comment", "block-key"], v, ["workspace", "passphrase", "public-key"])),
];

export async function runMenu(options = {}) {
  const session = createMenuSession(options);
  const state = {
    preferencesPath: options.preferencesPath || "",
    preferences: await loadPreferences(options.preferencesPath),
    selectedWorkspace: options.selectedWorkspace || "",
    secrets: {},
    runner: options.runner || defaultRunner,
    onStartAdmin: options.onStartAdmin || null,
  };
  state.selectedWorkspace = state.selectedWorkspace || state.preferences.selectedWorkspace || "";

  try {
    while (true) {
      await session.write(renderMainMenu(state));
      const answer = await session.question("Choose an option [0]: ");
      const choice = String(answer ?? "").trim();
      if (!choice) {
        await session.write("Press 0 to exit, or choose a numbered workflow.\n");
        continue;
      }
      if (choice === "0") break;
      if (choice === "1") {
        await runStartAdmin(session, state);
        continue;
      }
      if (choice === "11") {
        await runLearnMenu(session);
        continue;
      }
      const item = MAIN_ITEMS[Number(choice) - 1];
      if (!item) {
        await session.write("Unknown menu option.\n");
        continue;
      }
      await runActionMenu(session, state, item);
    }
  } finally {
    session.close();
  }
}

async function runStartAdmin(session, state) {
  const startAction = {
    title: "Start local Admin + Bridge",
    command: "node bin/postsnail-portable.js --run admin",
    summary: "Starts the browser admin and Surge bridge on 127.0.0.1.",
    privateData: "The admin and bridge run locally. Shell passphrases stay local.",
    inputs: ["A local browser"],
  };
  const choice = await promptActionChoice(session, startAction);
  if (choice !== "r") return;
  await session.write("Running: node bin/postsnail-portable.js --run admin\n");
  if (state.onStartAdmin) {
    const status = await state.onStartAdmin();
    await session.write(`Admin: ${status?.adminUrl || "started"}\nBridge: ${status?.bridgeUrl || "started"}\n`);
    return;
  }
  await session.write("Start this from PostSnail Portable to launch Admin + Bridge from the same TUI.\n");
}

async function runActionMenu(session, state, groupName) {
  const actions = TUI_ACTIONS.filter((entry) => entry.group === groupName);
  if (!actions.length) {
    await session.write(renderGroupSummary(groupName));
    return;
  }
  while (true) {
    await session.write(renderTuiGroup(groupName, actions));
    const answer = await session.question("Choose an action [0]: ");
    const rawChoice = String(answer ?? "").trim();
    if (!rawChoice) {
      await session.write("Press 0 to go back, or choose a numbered action.\n");
      continue;
    }
    const index = Number(rawChoice);
    if (!index) return;
    const selected = actions[index - 1];
    if (!selected) {
      await session.write("Unknown action.\n");
      continue;
    }
    await runTuiAction(session, state, selected);
  }
}

async function runTuiAction(session, state, selected) {
  while (true) {
    const choice = await promptActionChoice(session, selected);
    if (choice === "b") return;
    if (choice === "c") {
      await session.write(`${selected.command}\n`);
      continue;
    }
    if (choice !== "r") {
      await session.write("Choose R, C, or B.\n");
      continue;
    }
    try {
      const values = await collectInputs(session, state, selected.prompts);
      const argv = selected.buildArgs(values);
      await session.write(`Running: ${selected.command}\n`);
      await state.runner(argv);
      await savePreferencesForValues(state, values);
      await session.write("Done.\n");
    } catch (error) {
      await session.write(`Action failed: ${safeErrorMessage(error)}\n`);
    }
    return;
  }
}

async function promptActionChoice(session, selected) {
  await session.write(renderAction(selected));
  return String(await session.question("Choose [R/C/B]: ") ?? "").trim().toLowerCase();
}

async function collectInputs(session, state, prompts = []) {
  const values = {};
  for (const prompt of prompts) {
    const defaultValue = defaultForPrompt(state, prompt);
    const answer = prompt.secretKey
      ? await askSecret(session, state, prompt, defaultValue)
      : await askText(session, prompt, defaultValue);
    const value = answer || defaultValue || "";
    if (prompt.required && !String(value).trim()) {
      throw new Error(`${prompt.label} is required.`);
    }
    values[prompt.name] = value;
    if (prompt.rememberWorkspace && value) {
      state.selectedWorkspace = value;
    }
  }
  return values;
}

async function askText(session, prompt, defaultValue) {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  return String(await session.question(`${prompt.label}${suffix}: `) || "").trim();
}

async function askSecret(session, state, prompt, defaultValue) {
  const hasSessionSecret = Boolean(prompt.secretKey && state.secrets[prompt.secretKey]);
  const suffix = hasSessionSecret ? " [session saved]" : "";
  const answer = String(await session.questionSecret(`${prompt.label}${suffix}: `) || "");
  if (answer) {
    state.secrets[prompt.secretKey] = answer;
    return answer;
  }
  if (hasSessionSecret) return state.secrets[prompt.secretKey];
  return defaultValue || "";
}

function defaultForPrompt(state, prompt) {
  if (prompt.secretKey && state.secrets[prompt.secretKey]) return state.secrets[prompt.secretKey];
  if (prompt.defaultKey === "selectedWorkspace") return state.selectedWorkspace || "";
  if (prompt.defaultValue !== undefined) return String(prompt.defaultValue);
  return "";
}

async function savePreferencesForValues(state, values) {
  if (values.workspace) {
    state.preferences.selectedWorkspace = values.workspace;
  }
  if (!state.preferencesPath) return;
  await mkdir(dirname(state.preferencesPath), { recursive: true });
  await writeFile(state.preferencesPath, `${JSON.stringify(state.preferences, null, 2)}\n`, "utf8");
}

async function runLearnMenu(session) {
  const groups = groupedCliCommands();
  await session.write(renderLearnMenu(groups));
  const answer = await session.question("Choose a command group [0]: ");
  const rawChoice = String(answer ?? "").trim();
  if (!rawChoice) {
    await session.write("Press 0 to go back, or choose a command group.\n");
    return;
  }
  const index = Number(rawChoice);
  if (!index) return;
  const group = groups[index - 1];
  if (!group) {
    await session.write("Unknown command group.\n");
    return;
  }
  const actions = TUI_ACTIONS.filter((entry) => entry.group === group.name);
  if (actions.length) {
    for (const entry of actions) {
      await session.write(renderAction(entry));
    }
    return;
  }
  await session.write(renderGroupSummary(group.name));
}

function renderMainMenu(state = {}) {
  const selectedShell = state.selectedWorkspace || "none";
  return [
    "PostSnail TUI",
    "PostSnail Portable Command Center",
    "",
    `Selected Shell: ${selectedShell}`,
    "Admin: stopped",
    "Bridge: stopped",
    "",
    ...MAIN_ITEMS.map((item, index) => `${index + 1}) ${item}`),
    "0) Exit",
    "",
  ].join("\n");
}

function renderTuiGroup(groupName, actions) {
  return [
    groupName,
    "",
    ...actions.map((entry, index) => `${index + 1}) ${entry.title}`),
    "0) Back",
    "",
  ].join("\n");
}

function renderLearnMenu(groups) {
  return [
    "Learn CLI commands",
    "",
    ...groups.map((group, index) => `${index + 1}) ${group.name}`),
    "0) Back",
    "",
  ].join("\n");
}

function renderGroupSummary(groupName) {
  const group = groupedCliCommands().find((entry) => entry.name === groupName);
  if (!group) return `${groupName}\n\nNo commands are available for this section yet.\n`;
  return [
    groupName,
    "",
    ...group.commands.flatMap((command) => [
      command.usage,
      `  ${command.summary}`,
    ]),
    "",
  ].join("\n");
}

function renderAction(selected) {
  const inputs = selected.prompts?.map((entry) => entry.label) || selected.inputs || [];
  return [
    selected.title,
    "",
    "What it does:",
    selected.summary || "Runs the shown PostSnail CLI workflow.",
    "",
    "Private data:",
    selected.privateData,
    "",
    "Command:",
    selected.command,
    "",
    "Inputs needed:",
    ...inputs.map((inputName) => `- ${inputName}`),
    "",
    "[R] Run  [C] Show command  [B] Back",
    "",
  ].join("\n");
}

function action(group, title, command, summary, privateData, prompts, buildArgs) {
  return { group, title, command, summary, privateData, prompts, buildArgs };
}

function withFlags(baseArgs, values, keys) {
  const args = [...baseArgs];
  for (const key of keys) {
    const value = values[key];
    if (value === undefined || value === null || String(value).trim() === "") continue;
    args.push(`--${key}`, String(value));
  }
  return args;
}

function isYes(value) {
  return ["y", "yes", "true", "1"].includes(String(value || "").trim().toLowerCase());
}

function safeErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return message || "Unknown error.";
}

async function defaultRunner(argv) {
  const { runCli } = await import("./run.js");
  await runCli(argv);
}

async function loadPreferences(preferencesPath) {
  if (!preferencesPath) return {};
  try {
    const parsed = JSON.parse(await readFile(preferencesPath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function createMenuSession(options = {}) {
  const scripted = Array.isArray(options.scriptedAnswers) ? [...options.scriptedAnswers] : null;
  if (scripted) {
    return {
      async write(text) {
        process.stdout.write(text);
      },
      async question() {
        return scripted.shift() || "";
      },
      async questionSecret() {
        return scripted.shift() || "";
      },
      close() {},
    };
  }
  const mutedOutput = new MutedOutput(output);
  const rl = createInterface({ input, output: mutedOutput, terminal: true });
  return {
    async write(text) {
      output.write(text);
    },
    question(prompt) {
      return rl.question(prompt);
    },
    async questionSecret(prompt) {
      mutedOutput.muted = true;
      try {
        const answer = await rl.question(prompt);
        output.write("\n");
        return answer;
      } finally {
        mutedOutput.muted = false;
      }
    },
    close() {
      rl.close();
    },
  };
}

export class MutedOutput extends Writable {
  constructor(target) {
    super();
    this.target = target;
    this.muted = false;
  }

  _write(chunk, encoding, callback) {
    if (this.muted) {
      this.target.write("*", callback);
      return;
    }
    this.target.write(chunk, encoding, callback);
  }
}
