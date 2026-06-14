import { parseArgv } from "./argv.js";
import { runAssetCommand } from "./commands/asset.js";
import { runBuildCommand } from "./commands/build.js";
import { runCommentCommand } from "./commands/comment.js";
import { runDomainCommand } from "./commands/domain.js";
import { runForestCommand, runPublishCommand } from "./commands/workflow.js";
import { renderHelp } from "./commands/help.js";
import { runIdentityCommand } from "./commands/identity.js";
import { runLiveCommand } from "./commands/live.js";
import { runPageCommand } from "./commands/page.js";
import { runPluginCommand } from "./commands/plugin.js";
import { runPostCommand } from "./commands/post.js";
import { runProfileCommand } from "./commands/profile.js";
import { runShellNameCommand } from "./commands/shellname.js";
import { runVerifyCommand } from "./commands/verify.js";
import { runWorkspaceCommand } from "./commands/workspace.js";
import { runZipCommand } from "./commands/zip.js";
import { runMenu } from "./menu.js";

export async function runCli(argv = [], options = {}) {
  const { positionals, flags } = parseArgv(argv);

  if (flags.help || positionals.length === 0) {
    process.stdout.write(renderHelp());
    return;
  }

  if (positionals[0] === "menu") {
    await runMenu(options);
    return;
  }
  if (positionals[0] === "workspace") {
    await runWorkspaceCommand(positionals.slice(1), flags);
    return;
  }
  if (positionals[0] === "profile") {
    await runProfileCommand(positionals.slice(1), flags);
    return;
  }
  if (positionals[0] === "identity") {
    await runIdentityCommand(positionals.slice(1), flags);
    return;
  }
  if (positionals[0] === "plugin") {
    await runPluginCommand(positionals.slice(1), flags);
    return;
  }
  if (positionals[0] === "post") {
    await runPostCommand(positionals.slice(1), flags);
    return;
  }
  if (positionals[0] === "page") {
    await runPageCommand(positionals.slice(1), flags);
    return;
  }
  if (positionals[0] === "asset") {
    await runAssetCommand(positionals.slice(1), flags);
    return;
  }
  if (positionals[0] === "comment") {
    await runCommentCommand(positionals.slice(1), flags);
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
  if (positionals[0] === "live") {
    await runLiveCommand(positionals.slice(1), flags);
    return;
  }
  if (positionals[0] === "publish") {
    await runPublishCommand(positionals.slice(1), flags);
    return;
  }
  if (positionals[0] === "forest") {
    await runForestCommand(positionals.slice(1), flags);
    return;
  }
  if (positionals[0] === "shellname") {
    await runShellNameCommand(positionals.slice(1), flags);
    return;
  }
  if (positionals[0] === "domain") {
    await runDomainCommand(positionals.slice(1), flags);
    return;
  }

  throw new Error(`Unknown command: ${positionals[0]}`);
}
