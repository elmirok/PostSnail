# PostSnail Forest

Reference Cloudflare Worker tracker for PostSnail Forest. It accepts public site URLs, verifies registry-ready PostSnail proof metadata, indexes signed post summaries into D1, and exposes a public search page plus JSON API.

Forest does not verify full ZIP contents. Full bundle verification remains in the PostSnail admin Verify tab.

## Production

Current Worker URL:

```text
https://postsnail-registry.araujo-ortiz.workers.dev
```

Current Cloudflare resources:

- Worker: `postsnail-registry`
- D1 database: `postsnail-registry`
- Queue: `postsnail-crawl`
- Secrets: `ADMIN_TOKEN`, `RATE_LIMIT_SECRET`

## Local Setup

```bash
npm install
npm run wrangler:types
npm test
npm run typecheck
```

Apply the local D1 migration before exercising search endpoints through `wrangler dev`:

```bash
npx wrangler d1 migrations apply postsnail-registry --local
npm run dev
```

Copy `.dev.vars.example` to `.dev.vars` for local admin and rate-limit secrets. Do not commit `.dev.vars`.

## Deploy

Create production resources, replace the placeholder D1 database id in `wrangler.jsonc`, and set secrets:

```bash
npx wrangler d1 create postsnail-registry
npx wrangler queues create postsnail-crawl
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put RATE_LIMIT_SECRET
npx wrangler d1 migrations apply postsnail-registry --remote
npm run deploy:dry-run
npx wrangler deploy
```

## API

- `POST /api/submit` with `{ "url": "https://creator.example/" }` queues a public site crawl.
- `POST /api/announce` accepts a signed public PostSnail announce after a creator publishes a new ZIP.
- `GET /api/submissions/:id` reports crawl status.
- `GET /api/search?q=&tag=&limit=&cursor=` returns visible signed summary results.
- `GET /api/sites/:siteId` returns site proof metadata and visible posts.
- `POST /api/admin/sites/:siteId/hide`, `/unhide`, and `/recrawl` require `Authorization: Bearer <ADMIN_TOKEN>`.

## Refresh Model

Forest uses a hybrid low-cost refresh model. Creators can send a signed `postsnail-announce` payload after publishing a new static ZIP. Forest verifies the announce signature, HTTPS site URL, same-origin proof URLs, public key consistency, and rate limits, then fetches only the live `.well-known/postsnail.json` first.

If the live bundle fingerprint matches the announce and differs from the indexed fingerprint, Forest queues one crawl for that site/fingerprint. If the live site still serves the old fingerprint, Forest stores the pending fingerprint and retries soon. If the fingerprint is already indexed, Forest returns `current`.

Cron triggers run every 15 minutes as a backup, but each run processes only a capped number of due sites. Quiet sites back off toward daily checks, failing sites back off harder, and full manifest/post verification happens only after the cheap `.well-known` fingerprint changed.

## Trust Model

Forest stores site metadata and post titles, tags, excerpts, published dates, digests, URLs, public keys, and bundle fingerprints. It does not store full post bodies and does not prove legal identity or factual accuracy.

## Cost And Abuse Surface

Forest JSON API requests can increase Cloudflare usage. Public search and site endpoints use Worker requests and D1 rows read. Submissions and announces use Worker requests, D1 rate-limit reads/writes, submission writes when queued, Queue operations when a crawl is needed, crawler fetches, and crawl-result writes. Scheduled freshness checks add Worker invocations and small `.well-known` fetches; changed fingerprints add Queue and crawl work.

Cloudflare Free plan limits generally fail closed once exhausted, which can cause public errors or delayed indexing. Workers Paid can bill for overages. Keep the built-in submission and announce rate limits, keep the scheduled per-run cap conservative, and add Cloudflare dashboard/WAF rate rules for `/api/search`, `/api/submit`, and `/api/announce` before a public launch.
