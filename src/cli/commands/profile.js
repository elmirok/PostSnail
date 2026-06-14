import { openCliWorkspace, printJson } from "../state.js";

export async function runProfileCommand(positionals, flags) {
  const subcommand = positionals[0];
  if (!["show", "set"].includes(subcommand)) throw new Error("Unknown profile command.");
  const context = await openCliWorkspace(flags);

  if (subcommand === "show") {
    printJson(context.state.profile || {});
    return;
  }

  const profile = { ...(context.state.profile || {}) };
  const mappings = [
    ["site-title", "siteTitle"],
    ["title", "siteTitle"],
    ["handle", "handle"],
    ["site-url", "siteUrl"],
    ["description", "description"],
    ["bio", "bio"],
    ["author", "author"],
  ];
  for (const [flag, field] of mappings) {
    if (flags[flag] !== undefined) profile[field] = String(flags[flag] || "").trim();
  }
  context.state.profile = profile;
  await context.save();
  process.stdout.write("Profile updated.\n");
}
