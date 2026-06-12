#!/usr/bin/env node
import { runPortableLauncher } from "../src/portable/launcher.js";

const argv = process.argv.slice(2);

if (argv.includes("--help") || argv.includes("-h")) {
  process.stdout.write([
    "PostSnail Portable",
    "",
    "Launches the local admin, starts the local Surge bridge helper, and opens the browser.",
    "",
    "Options:",
    "  --no-open              Start the server without opening the browser",
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
  adminPort: options.adminPort,
  bridgePort: options.bridgePort,
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error || "Portable launch failed."));
  process.exitCode = 1;
});

function parsePortableArgs(args) {
  const result = { noOpen: false, adminPort: null, bridgePort: null };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--no-open") {
      result.noOpen = true;
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
    }
  }
  return result;
}
