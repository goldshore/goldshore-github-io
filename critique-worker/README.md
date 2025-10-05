# Gold Shore Critique Pipeline

This Worker pair processes inbound critique requests (email or form posts), performs automated analyses, and returns a Markdown report link by email. Use it to deliver one-time website, portfolio, or social audits.

## Components

- **`src/ingress.js`** – Receives Postmark inbound webhooks or form submissions and enqueues normalized jobs.
- **`src/consumer.js`** – Dequeues work, runs the requested critique, stores the Markdown report in R2, and emails the requester.
- **`wrangler.toml`** – Binds Cloudflare Queues, R2, and KV, and exposes environment variables for API keys.

## Prerequisites

1. Cloudflare account with Workers, Queues, KV, and R2 enabled.
2. Least-privilege API token with:
   - Account → Workers Scripts (Read, Write)
   - Account → Queues (Read, Write)
   - Account → R2 (Read, Write)
   - Account → KV Storage (Read, Write)
   - Optional: Zone → Cache Rules (Read)
3. Postmark (or compatible) account with:
   - Outbound server token for sending reports
   - Inbound server token + webhook for ingesting requests
4. Google PageSpeed Insights API key for Core Web Vitals.

## Setup Steps

```bash
npm install -g wrangler
wrangler login
wrangler kv:namespace create CONFIG_KV
wrangler queues create critique-queue
wrangler queues create critique-dead
wrangler r2 bucket create goldshore-reports
```

1. Copy `critique-worker/wrangler.toml`, fill in your `account_id`, KV namespace ID, and environment variables.
2. Store secrets with `wrangler secret put` as needed (e.g., `POSTMARK_SERVER_TOKEN`).
3. Deploy the ingress Worker and queue consumer:

```bash
wrangler deploy critique-worker/src/ingress.js --name goldshore-critique
wrangler deploy critique-worker/src/consumer.js --name goldshore-critique-consumer
```

4. In Postmark, set the inbound webhook URL to the deployed ingress endpoint (e.g., `https://<worker-subdomain>.workers.dev/`).
5. Test by emailing `critiques@goldshore.org` with body fields like:

```
TYPE: website
TARGET: https://goldshore.org
NOTES: Focus on cache-control and LCP
```

You should receive a reply containing a Markdown summary and link to the stored report.

## Customization Tips

- Populate `CONFIG_KV` with per-client presets (aliases, branding, report templates).
- Set `PUBLIC_REPORT_BASE` and `PUBLIC_REPORT_TTL` to control how report links are generated.
- If you use a provider other than Postmark, swap out the HMAC check in `src/ingress.js` for that provider's signature scheme.
- Extend `portfolioReport` and `socialReport` with deeper analytics once you connect portfolio CSV parsers or social platform APIs.
