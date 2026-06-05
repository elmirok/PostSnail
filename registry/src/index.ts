import { handleRequest, depsFromEnv } from "./app";
import { processCrawlMessage } from "./crawler";
import { processScheduledChecks } from "./scheduler";

export default {
  fetch(request, env) {
    return handleRequest(request, depsFromEnv(env));
  },
  async queue(batch, env) {
    const deps = depsFromEnv(env);
    for (const message of batch.messages) {
      await processCrawlMessage(message.body, deps);
    }
  },
  async scheduled(_controller, env) {
    await processScheduledChecks(depsFromEnv(env));
  },
} satisfies ExportedHandler<Env, { submissionId: string; siteUrl: string }>;
