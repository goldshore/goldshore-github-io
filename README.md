# GoldShore Monorepo

This repository houses the GoldShore web properties, Cloudflare Worker router, shared packages, and automation workflows. It is organised as a multi-app workspace so infrastructure, front-ends, and workers can ship together through a single pipeline.

## Repository layout

```
.
├─ apps/
│  ├─ admin/        # Admin dashboard (Astro)
│  ├─ api/          # Cloudflare Worker API (Wrangler)
│  ├─ api-router/   # Edge router that fans out to workers & Pages
│  └─ web/          # Marketing site (Astro)
├─ infra/
│  ├─ cf/           # Cloudflare bindings + D1 migrations
│  ├─ policies/     # Zero Trust & Access documentation
│  └─ scripts/      # DNS and Access automation scripts
├─ packages/
│  ├─ admin/        # Admin UI workspace shell
│  ├─ agent/        # AI agent orchestration helpers
│  ├─ ai-maint/     # Automated maintenance utilities
│  ├─ api/          # Shared Worker API utilities
│  ├─ assets/       # Shared logos and favicons
│  ├─ libs/         # Cross-project TypeScript helpers
│  ├─ sentry/       # Optional Sentry bindings
│  ├─ theme/        # Design tokens and CSS primitives
│  └─ web/          # Marketing site composition helpers
├─ docs/            # Runbooks and internal documentation
├─ .github/workflows
├─ package.json     # npm workspaces + shared tooling
└─ wrangler.toml    # Worker + Pages routing configuration
```

## Getting started

1. Install dependencies from the repo root:
   ```bash
   npm install
   ```
2. Start the marketing site locally:
   ```bash
   npm run dev --workspace apps/web
   ```
3. Optionally run the admin dashboard:
   ```bash
   npm run dev --workspace apps/admin
   ```
4. Optimise images before committing new assets:
   ```bash
   npm run process:images
   ```

`.dev.vars.example` lists useful environment variables for local previews. Copy it to `.dev.vars` and fill in placeholder values.

## Deployments

The **Deploy goldshore + infra** workflow (`.github/workflows/deploy.yml`) runs on pushes to `main` that touch application, package, or infrastructure files. The pipeline:

1. Installs dependencies and builds shared assets once.
2. Reuses the build artifact to deploy the Cloudflare Workers to the `preview`, `dev`, and `production` environments.
3. Serialises shared Cloudflare mutations by rebuilding Access applications and syncing DNS records after all worker deployments finish.

Manual runs are available through **Run workflow** in the GitHub Actions UI.

## Required repository secrets

Configure the following under **Settings → Secrets and variables → Actions**:

| Secret | Purpose |
| --- | --- |
| `CF_ACCOUNT_ID` | Cloudflare account that hosts Workers, D1, and Access apps |
| `CF_API_TOKEN` | Token with Workers, Pages, DNS, and Access permissions |
| `CF_ZONE_ID` | Primary DNS zone identifier (used by automation scripts) |
| `OPENAI_API_KEY` | Used by the AI maintenance utilities |
| `OPENAI_PROJECT_ID` | OpenAI project identifier for AI maintenance |

Additional credentials (for example Access `AUD/ISS`, Turnstile, and Formspree endpoints) should be stored per environment using Wrangler secrets or Pages environment variables.

## Infrastructure automation

- `infra/scripts/upsert-goldshore-dns.sh` reconciles DNS across GoldShore and Fortune Fund domains. It reads from configuration embedded in the script and requires `CF_API_TOKEN`/`CF_ACCOUNT_ID` at runtime.
- `infra/scripts/rebuild-goldshore-access.sh` reapplies Cloudflare Access application settings so new routes stay protected.

Both scripts are idempotent and can be triggered manually or via the deploy workflow.

## Local Wrangler usage

To preview the API router or other workers locally:

```bash
npm run dev --workspace apps/api-router        # Local worker dev server
npm run deploy --workspace apps/api -- --env=dev  # Deploy the API worker to dev
```

Consult the guides in [`docs/`](docs) for deeper architecture notes, onboarding instructions, and Cloudflare deployment details.
