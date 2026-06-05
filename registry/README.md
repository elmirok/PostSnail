# PostSnail Registry

Reference Cloudflare Worker registry for PostSnail microblogs. It accepts public site URLs, verifies registry-ready PostSnail proof metadata, indexes signed post summaries into D1, and exposes a public search page plus JSON API.

The registry does not verify full ZIP contents. Full bundle verification remains in the PostSnail admin Verify tab.

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
- `GET /api/submissions/:id` reports crawl status.
- `GET /api/search?q=&tag=&limit=&cursor=` returns visible signed summary results.
- `GET /api/sites/:siteId` returns site proof metadata and visible posts.
- `POST /api/admin/sites/:siteId/hide`, `/unhide`, and `/recrawl` require `Authorization: Bearer <ADMIN_TOKEN>`.

## Trust Model

The registry stores site metadata and post titles, tags, excerpts, published dates, digests, URLs, public keys, and bundle fingerprints. It does not store full post bodies and does not prove legal identity or factual accuracy.
