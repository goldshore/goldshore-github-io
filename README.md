# GoldShore Monorepo

This repository hosts the GoldShore marketing site, Cloudflare Worker router, shared packages, and automation scripts. Everything is organised as an npm workspace so the web surface, Worker, database schema, and tooling deploy together through GitHub Actions.

## Repository layout

```
.
├─ apps/
│  ├─ web/          # Astro site (static output)
│  └─ api-router/   # Cloudflare Worker router
├─ packages/
│  ├─ theme/        # Shared styling primitives
│  ├─ ai-maint/     # AI maintenance tooling (Node)
│  └─ db/           # D1 schema and helpers
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
3. Optimise images before committing new assets:
   ```bash
   npm run process:images --workspace apps/web
   ```

## Deployments & workflows

| Workflow | Purpose | Trigger |
| --- | --- | --- |
| `deploy.yml` | Installs dependencies, processes images, builds the Astro site, deploys the Worker (`production`, `preview`, `dev`), refreshes Access, and syncs DNS. | Push to `main` (selected paths) or manual run |
| `ai_maint.yml` | Lints Astro/CSS assets, runs Lighthouse in smoke mode, and (when applicable) opens conservative copy-fix PRs. | Nightly (05:00 UTC) or manual run |
| `sync_dns.yml` | Replays the DNS upsert script. | Manual run |

Required repository secrets:

- `CF_ACCOUNT_ID`
- `CF_API_TOKEN`
- `CF_SECRET_STORE_ID`
- `CF_ZONE_ID`
- `OPENAI_API_KEY`
- `OPENAI_PROJECT_ID`

## Cloudflare configuration

`wrangler.toml` binds the Worker to the GoldShore Secrets Store (`OPENAI_API_KEY`, `OPENAI_PROJECT_ID`, `CF_API_TOKEN`). Provide a D1 database binding after provisioning the database:

```toml
[[d1_databases]]
binding = "DB"
database_name = "goldshore-db"
database_id = "REPLACE_WITH_D1_ID"
```

## Scripts

- `infra/scripts/upsert-goldshore-dns.sh` — Ensures the apex, `www`, `preview`, and `dev` DNS records exist and are proxied through Cloudflare.
- `infra/scripts/rebuild-goldshore-access.sh` — Reconciles Access applications for production, preview, and development admin surfaces with a default allow policy.
- `apps/web/scripts/process-images.mjs` — Optimises raw hero/gallery images into WebP and AVIF variants with subtle overlays.

## Database

`packages/db/schema.sql` defines the initial Cloudflare D1 tables for blog posts and store products. Seed the database by running:

```bash
wrangler d1 execute goldshore-db --file=packages/db/schema.sql
```

## Shared packages

- `packages/theme` — Placeholder for design tokens and shared CSS primitives.
- `packages/ai-maint` — Reserved for AI maintenance helpers.
- `packages/db` — Hosts the D1 schema and future Drizzle integration.

## Notes

- The Worker deploy relies on the Cloudflare Secrets Store; ensure the mapped secrets already exist.
- Cloudflare Access automation defaults to allowing `@goldshore.org` addresses. Adjust `ALLOWED_DOMAIN` when running the script if your allowlist differs.
- The AI maintenance workflow only opens pull requests when copy suggestions change files; merge decisions stay with humans.
