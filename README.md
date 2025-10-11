# GoldShore Monorepo

This repository powers the GoldShore marketing site, Cloudflare Worker router, and maintenance scripts. The project ships as a static Astro site served behind a Cloudflare Worker that protects the production domain while keeping preview deployments inexpensive.

## Project layout

- `apps/web` – Astro front-end for the marketing site and supporting pages.
- `apps/api-router` – Cloudflare Worker that routes traffic to the appropriate Pages origin and stamps cache/Access headers.
- `packages/` – Shared tooling (image processing, AI maintenance helpers, etc.).
- `infra/` – Shell scripts for DNS automation and Access provisioning.
- `docs/` – Deployment playbooks and additional reference material.

Install dependencies with `npm install` and run `npm run dev` to start the Astro site locally. The `npm run build` and `npm run process-images` scripts mirror the CI pipeline.

## Cloudflare Worker deployment

The Worker settings live in [`wrangler.toml`](wrangler.toml). The repository assumes a dedicated Cloudflare API token named **“Goldshore Worker”** that has the following permissions:

- Account → Workers Scripts (Edit)
- Account → Workers Routes (Edit)
- Account → Worker KV Storage (Edit)
- Account → Queues (Edit) if you operate the critique pipeline
- Account → R2 Storage (Edit) when reports are stored in R2
- Account → Pages (Read) so the Worker can discover origin hostnames

Create the token in the Cloudflare dashboard and save it locally as `CF_API_TOKEN`:

```bash
# One time per machine
wrangler login # optional if you prefer OAuth
wrangler secret put CF_API_TOKEN --env production
wrangler secret put CF_API_TOKEN --env preview
wrangler secret put CF_API_TOKEN --env dev
```

For automated workflows (CI, scripts in `infra/`), export the same value or add it to your `.dev.vars` file:

```bash
cat >> .dev.vars <<'ENV'
CF_API_TOKEN="<your-goldshore-worker-token>"
ENV
```

### Environment-specific settings

- **Production (`wrangler deploy --env production`)** – Routes `goldshore.org/*` and `www.goldshore.org/*` to the production Pages origin defined in `ASSETS_ORIGIN`.
- **Preview (`wrangler deploy --env preview`)** – Provides Workers.dev previews and optional routed staging domains while pointing at `https://goldshore-org-preview.pages.dev`.
- **Dev (`wrangler deploy --env dev`)** – Restricts routing to `dev.goldshore.org/*` for experimental branches.

Each environment shares the `APP_NAME`, origin mappings, and Turnstile/OpenAI secrets. Update [`wrangler.toml`](wrangler.toml) when origin hostnames change and redeploy with the appropriate `wrangler deploy` command.

## Related documentation

- [`docs/cloudflare-deployment.md`](docs/cloudflare-deployment.md) – Checklist for keeping Pages and the Worker in sync.
- [`GOLDSHORE_IMPLEMENTATION_GUIDE.md`](GOLDSHORE_IMPLEMENTATION_GUIDE.md) – Deep dive into layout, automation, and DNS practices.
