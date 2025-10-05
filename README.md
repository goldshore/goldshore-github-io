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
