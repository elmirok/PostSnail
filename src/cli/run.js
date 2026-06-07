import { parseArgv } from "./argv.js";
import { runBuildCommand } from "./commands/build.js";
import { renderHelp } from "./commands/help.js";
import { runPostCommand } from "./commands/post.js";
import { runVerifyCommand } from "./commands/verify.js";
import { runWorkspaceCommand } from "./commands/workspace.js";
import { runZipCommand } from "./commands/zip.js";

export async function runCli(argv = []) {
  const { positionals, flags } = parseArgv(argv);

  if (flags.help || positionals.length === 0) {
    process.stdout.write(renderHelp());
    return;
  }

  if (positionals[0] === "workspace") {
    await runWorkspaceCommand(positionals.slice(1), flags);
    return;
  }
  if (positionals[0] === "post") {
    await runPostCommand(positionals.slice(1), flags);
    return;
  }
  if (positionals[0] === "build") {
    await runBuildCommand(flags);
    return;
  }
  if (positionals[0] === "verify") {
    await runVerifyCommand(positionals.slice(1));
    return;
  }
  if (positionals[0] === "zip") {
    await runZipCommand(flags);
    return;
  }

  throw new Error(`Unknown command: ${positionals[0]}`);
}
