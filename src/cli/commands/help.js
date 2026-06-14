import { groupedCliCommands } from "../catalog.js";

export function renderHelp() {
  const lines = [
    "PostSnail CLI",
    "",
    "Command Center:",
    "  postsnail menu",
    "",
    "Commands:",
  ];
  for (const group of groupedCliCommands()) {
    lines.push(``, `${group.name}:`);
    for (const command of group.commands) {
      lines.push(`  ${command.usage}`);
      lines.push(`    ${command.summary}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
