#!/usr/bin/env node
import { runPortableLauncher } from "../src/portable/launcher.js";

const argv = process.argv.slice(2);

if (argv.includes("--help") || argv.includes("-h")) {
  process.stdout.write([
    "PostSnail Portable",
    "",
    "Opens the CLI-first Command Center, or starts the local Admin + Surge bridge when requested.",
    "",
    "Options:",
    "  --no-open              Start without opening the browser",
    "  --no-menu              Start Admin + Bridge without opening the CLI menu",
    "  --menu                 Open the CLI Command Center",
    "  --run <mode>           Choose cli or admin without the menu",
    "  --admin-port <port>    Override the local admin port",
    "  --bridge-port <port>   Override the local bridge port",
    "",
  ].join("\n"));
  process.exit(0);
}

const options = parsePortableArgs(argv);

runPortableLauncher({
  entryPoint: import.meta.url,
  skipBrowser: options.noOpen,
  skipMenu: options.noMenu,
  runMode: options.runMode,
  adminPort: options.adminPort,
  bridgePort: options.bridgePort,
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error || "Portable launch failed."));
  process.exitCode = 1;
});

function parsePortableArgs(args) {
  const result = { noOpen: false, noMenu: false, runMode: null, adminPort: null, bridgePort: null };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--no-open") {
      result.noOpen = true;
      continue;
    }
    if (value === "--no-menu") {
      result.noMenu = true;
      continue;
    }
    if (value === "--admin-only") {
      result.runMode = "admin";
      continue;
    }
    if (value === "--menu") {
      result.runMode = "cli";
      continue;
    }
    if (value === "--run") {
      result.runMode = args[index + 1];
      index += 1;
      continue;
    }
    if (value === "--admin-port") {
      result.adminPort = Number(args[index + 1]);
      index += 1;
      continue;
    }
    if (value === "--bridge-port") {
      result.bridgePort = Number(args[index + 1]);
      index += 1;
      continue;
    }
  }
  return result;
}
