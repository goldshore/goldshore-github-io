# GoldShore platform

This repository hosts GoldShore's Worker router, Astro front-end, D1 schema, and infrastructure automation. The layout is organised as a lightweight monorepo so the Worker, web app, database schema, and supporting tooling can ship together through GitHub Actions.

## Repository layout

```
goldshore/
├─ apps/
│  ├─ api-router/          # Cloudflare Worker entry point
│  └─ web/                 # Astro site, vanilla CSS theme
├─ packages/
│  ├─ db/                  # D1 schema & Drizzle entry point (future)
│  └─ ai-maint/            # Reserved for AI maintenance helpers
├─ infra/
│  └─ scripts/             # DNS & Access automation
├─ .github/workflows/      # Deploy / maintenance CI
├─ wrangler.toml           # Worker + bindings configuration
└─ package.json            # npm workspaces + shared tooling
```

Key entry points:

- `apps/api-router/src/router.ts` — Worker proxy that selects the correct asset origin per host, applies strict CORS, and passes the request through without mutating CSS or binary assets.
- `apps/web/src` — Astro site with a shared theme (`styles/theme.css`) and starter homepage content (`pages/index.astro`). Additional routes (blog, store, admin, etc.) can be added here using Astro collections or standard `.astro` pages.
- `packages/db/schema.sql` — Cloudflare D1 schema for blog posts and store products.
- `infra/scripts/*.sh` — Shell scripts that upsert required DNS records and ensure Cloudflare Access policies for `/admin`.

## Workflows

| Workflow | Purpose | Trigger |
| --- | --- | --- |
| `deploy.yml` | Builds the Astro site, deploys the Worker to `production`, `preview`, and `dev`, refreshes Access, and syncs DNS. | Push to `main` (selected paths) or manual run |
| `ai_maint.yml` | Runs linting, Lighthouse smoke tests, and guarded AI copy suggestions that open PRs. | Nightly (05:00 UTC) or manual run |
| `sync_dns.yml` | Manually replays the DNS upsert script. | Manual run |

## Prerequisites

Configure the following repository secrets under **Settings → Secrets and variables → Actions**:

- `CF_ACCOUNT_ID`
- `CF_API_TOKEN`
- `CF_SECRET_STORE_ID`
- `OPENAI_API_KEY`
- `OPENAI_PROJECT_ID`

These secrets are consumed by the Worker (via the Secrets Store binding) and GitHub Actions. The deploy workflow also expects `jq` (available on the GitHub Actions runner).

## Local development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start Astro locally:
   ```bash
   cd apps/web
   npm install
   npm run dev
   ```
3. Deploy the Worker preview when ready:
   ```bash
   npx wrangler dev
   ```

The image optimisation script expects source assets in `apps/web/public/images/raw` and emits AVIF/WEBP variants into `apps/web/public/images/optimized`.

## Database setup

Provision a Cloudflare D1 database named `goldshore-db` and copy its ID into `wrangler.toml` under the `[[d1_databases]]` block. Initial seed tables can be created by running:

```bash
wrangler d1 execute goldshore-db --file=packages/db/schema.sql
```

Future Drizzle integration can live in `packages/db` alongside the schema.

## Notes

- The Worker deploy relies on the Cloudflare Secrets Store; be sure the store already contains the mapped secrets (`OPENAI_API_KEY`, `OPENAI_PROJECT_ID`, `CF_API_TOKEN`).
- Cloudflare Access automation defaults to allowing `@goldshore.org` addresses. Adjust `ALLOWED_DOMAIN` when running the script if your allowlist differs.
- The AI maintenance workflow is conservative and only opens pull requests when copy changes are suggested. Merge decisions stay in human hands.
