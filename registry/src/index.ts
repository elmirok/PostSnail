import { handleRequest, depsFromEnv } from "./app";
import { processCrawlMessage } from "./crawler";

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
} satisfies ExportedHandler<Env, { submissionId: string; siteUrl: string }>;
