import {
  createApprovedCommentRecord,
  createRejectedCommentRecord,
  verifyCommentPacket,
} from "../../comments/plugin.js";
import { cleanText, openCliWorkspace, readJsonFile } from "../state.js";

export async function runCommentCommand(positionals, flags) {
  const subcommand = positionals[0];
  if (!["verify", "approve", "reject", "list", "block-key"].includes(subcommand)) {
    throw new Error("Unknown comment command.");
  }

  if (subcommand === "verify") {
    const packet = await readPacket(positionals[1]);
    const result = verifyCommentPacket(packet);
    process.stdout.write(result.ok ? `Comment verified: ${result.comment.commentId}\n` : `Comment verification failed: ${result.errors.join("; ")}\n`);
    return;
  }

  const context = await openCliWorkspace(flags);
  context.state.moderation ||= { approvedComments: [], rejectedComments: [], blockedPublicKeys: [] };

  if (subcommand === "list") {
    process.stdout.write([
      `Approved comments: ${context.state.moderation.approvedComments.length}`,
      `Rejected comments: ${context.state.moderation.rejectedComments.length}`,
      `Blocked author public keys: ${context.state.moderation.blockedPublicKeys.length}`,
      "",
    ].join("\n"));
    return;
  }

  if (subcommand === "block-key") {
    const key = cleanText(flags["public-key"] || positionals[1]);
    if (!key) throw new Error("Public key is required.");
    context.state.moderation.blockedPublicKeys = [
      ...new Set([...(context.state.moderation.blockedPublicKeys || []), key]),
    ];
    await context.save();
    process.stdout.write("Blocked comment author public key.\n");
    return;
  }

  const packet = await readPacket(positionals[1]);
  if (subcommand === "approve") {
    const record = createApprovedCommentRecord(packet, {
      sitePublicKey: context.state.identity?.publicKey || "",
      source: "cli",
    });
    context.state.moderation.approvedComments = [record, ...(context.state.moderation.approvedComments || [])];
    await context.save();
    process.stdout.write(`Approved comment: ${record.comment.commentId}\n`);
    return;
  }

  const record = createRejectedCommentRecord(packet, {
    sitePublicKey: context.state.identity?.publicKey || "",
    moderationNote: cleanText(flags.note),
    source: "cli",
  });
  context.state.moderation.rejectedComments = [record, ...(context.state.moderation.rejectedComments || [])];
  await context.save();
  process.stdout.write(`Rejected comment: ${record.comment.commentId}\n`);
}

async function readPacket(path) {
  const packetPath = cleanText(path);
  if (!packetPath) throw new Error("Comment JSON path is required.");
  return readJsonFile(packetPath);
}
