# GoldShore Monorepo

This repository hosts the GoldShore marketing site, Cloudflare Worker router, shared packages, and automation workflows. The structure keeps each concern isolated while still benefiting from a single workspace for dependency management.

```
.
├─ apps/
│  ├─ web/          # Astro site (static output)
│  └─ api-router/   # Cloudflare Worker router
├─ packages/
│  ├─ theme/        # Shared styling primitives
│  ├─ ai-maint/     # AI maintenance tooling (Node)
│  └─ db/           # D1 schema and drizzle helpers
├─ infra/
│  ├─ scripts/      # DNS + Access automation
│  └─ access/       # Access configuration JSON
├─ .github/workflows
└─ wrangler.toml
```

## Getting started

1. Install dependencies from the repo root:
   ```bash
   npm install
   ```
2. Start the Astro dev server:
   ```bash
   npm run dev --workspace apps/web
   ```
3. Run the image pipeline before committing new assets:
   ```bash
   npm run process:images --workspace apps/web
   ```

## Deployments

Deployments are handled by **.github/workflows/deploy.yml** whenever `main` changes or when triggered manually. The workflow:
- installs workspace dependencies,
- runs the image optimization script,
- builds the Astro site,
- deploys the Worker to `production`, `preview`, and `dev` environments,
- reconciles Cloudflare Access apps, and
- syncs DNS records for `goldshore.org` hosts.

Required repository secrets:

| Secret | Purpose |
| --- | --- |
| `CF_ACCOUNT_ID` | Cloudflare account containing the Worker and Access apps |
| `CF_API_TOKEN` | Token with Workers, Pages, DNS, and Access permissions |
| `CF_SECRET_STORE_ID` | Cloudflare Secrets Store identifier |
| `CF_ZONE_ID` | Zone ID for `goldshore.org` (used by DNS sync job) |
| `OPENAI_API_KEY` | Access token for AI maintenance tasks |
| `OPENAI_PROJECT_ID` | Associated OpenAI project identifier |

## AI maintenance

The scheduled **AI maintenance (safe)** workflow lint checks Astro/CSS assets, runs Lighthouse in a static smoke mode, and—when eligible—opens a pull request with conservative copy fixes. Extend `packages/ai-maint` with richer tooling when you are ready to involve external APIs.

## Database

`packages/db/schema.sql` defines the foundational Cloudflare D1 tables for blog posts and store products. Bind the database in `wrangler.toml` by replacing `REPLACE_WITH_D1_ID` with your provisioned database ID.

## Infrastructure scripts

- `infra/scripts/upsert-goldshore-dns.sh` keeps the core DNS records up to date. It requires `CF_API_TOKEN` and either `CF_ZONE_ID` or a resolvable `ZONE_NAME`.
- `infra/scripts/rebuild-goldshore-access.sh` replays the Access configuration stored in `infra/access/applications.json`.

Both scripts are safe to run repeatedly; they will create or update records and policies as needed.
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
# GoldShore Infrastructure Monorepo

This repository hosts the Cloudflare Worker router, Astro web surface, automation scripts, and supporting packages that power the GoldShore site and related tooling.

## Layout

```
apps/
  api-router/     # Cloudflare Worker that routes requests to the correct asset origin
  web/            # Astro front-end using a shared theme
packages/
  ai-maint/       # AI maintenance helpers and prompts
  db/             # D1 schema and migration tooling
  theme/          # Shared CSS tokens and design primitives
infra/
  scripts/        # Cloudflare DNS and Access automation scripts
.github/workflows # Deployment, DNS sync, and AI maintenance pipelines
wrangler.toml     # Worker + environment configuration (Secrets Store enabled)
package.json      # npm workspaces and shared dev dependencies
```

## Getting started

1. Install dependencies: `npm install`.
2. Run the image optimizer before building: `npm run process:images` or `node apps/web/scripts/process-images.mjs`.
3. Build the Astro site: `npm run build:web` (uses the workspace script defined in `package.json`).
4. Deploy via GitHub Actions:
   - `Deploy goldshore + infra` runs on pushes to `main` or on demand and targets production/preview/dev.
   - `AI maintenance (safe)` performs scheduled copy/link reviews and opens PRs with proposed fixes.
   - `Sync DNS records` can be triggered manually when DNS changes are required.

## Cloudflare configuration

- `wrangler.toml` binds the Worker to the GoldShore Secrets Store (`OPENAI_API_KEY`, `OPENAI_PROJECT_ID`, `CF_API_TOKEN`).
- Provide a D1 database binding once the database is provisioned:
  ```toml
  [[d1_databases]]
  binding = "DB"
  database_name = "goldshore-db"
  database_id = "REPLACE_WITH_D1_ID"
  ```
- Secrets referenced in the GitHub Actions workflows must be added under **Settings → Secrets and variables → Actions**:
  - `CF_ACCOUNT_ID`
  - `CF_API_TOKEN`
  - `CF_SECRET_STORE_ID`
  - `OPENAI_API_KEY`
  - `OPENAI_PROJECT_ID`

## Scripts

- `infra/scripts/upsert-goldshore-dns.sh` — idempotently ensures the apex, `www`, `preview`, and `dev` DNS records exist and are proxied through Cloudflare.
- `infra/scripts/rebuild-goldshore-access.sh` — recreates Access applications for production, preview, and development admin surfaces with a default allow policy.
- `apps/web/scripts/process-images.mjs` — optimizes raw hero/gallery images into WebP and AVIF variants with subtle overlays.

## Database seed

Seed tables and initial data by running the SQL in `packages/db/schema.sql` against the bound Cloudflare D1 instance. Extend this package with Drizzle ORM migrations when application code is ready to query the database.

## Theme and AI maintenance packages

The `theme` and `ai-maint` packages are placeholders for shared CSS tokens and AI agent utilities. Expand them as the design system and maintenance tasks grow.
