#!/usr/bin/env node
import { runPortableLauncher } from "../src/portable/launcher.js";

const argv = process.argv.slice(2);

if (argv.includes("--help") || argv.includes("-h")) {
  process.stdout.write([
    "PostSnail Portable",
    "",
    "Asks whether to run the local admin, local Forest, or both, then opens the selected browser view.",
    "",
    "Options:",
    "  --no-open              Start the server without opening the browser",
    "  --no-menu              Use the default Admin-only mode without asking",
    "  --run <mode>           Choose admin, forest, or both without the menu",
    "  --forest-port <port>   Override the local Forest port",
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
  forestPort: options.forestPort,
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error || "Portable launch failed."));
  process.exitCode = 1;
});

function parsePortableArgs(args) {
  const result = { noOpen: false, noMenu: false, runMode: null, adminPort: null, bridgePort: null, forestPort: null };
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
    if (value === "--forest-only") {
      result.runMode = "forest";
      continue;
    }
    if (value === "--both") {
      result.runMode = "both";
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
    if (value === "--forest-port") {
      result.forestPort = Number(args[index + 1]);
      index += 1;
    }
  }
  return result;
}
