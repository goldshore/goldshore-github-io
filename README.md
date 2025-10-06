# GoldShore platform

This repository hosts GoldShore's Worker router, Astro front-end, D1 schema, and infrastructure automation. The layout is organised as a lightweight monorepo so the Worker, web app, database schema, and supporting tooling can ship together through GitHub Actions.

## Repository layout

```
goldshore/
├─ apps/
│  ├─ api-router/          # Cloudflare Worker entry point
│  └─ web/                 # Astro site, vanilla CSS theme
├─ packages/
│  └─ image-tools/         # Sharp image optimisation scripts
├─ infra/
│  └─ scripts/             # DNS & Access automation
├─ .github/workflows/      # Deploy / maintenance CI
├─ wrangler.toml           # Worker + bindings configuration
└─ package.json            # npm workspaces + shared tooling
```

Key entry points:

- `apps/api-router/src/router.ts` — Worker proxy that selects the correct asset origin per host and stamps immutable cache headers for assets.
- `apps/web/src` — Astro site with a shared theme (`styles/theme.css`), reusable components, and hero animation.
- `packages/image-tools/process-images.mjs` — Sharp pipeline that emits AVIF/WEBP variants before every build.
- `infra/scripts/*.sh` — Shell scripts that upsert required DNS records and ensure Cloudflare Access policies for `/admin`.

For a deeper end-to-end playbook that covers design, accessibility, deployment, DNS, and Cloudflare configuration, see [Gold Shore implementation playbook](./GOLDSHORE_IMPLEMENTATION_GUIDE.md).

## Workflows

| Workflow | Purpose | Trigger |
| --- | --- | --- |
| `deploy.yml` | Builds the Astro site, deploys the Worker to `production`, `preview`, and `dev`, then syncs DNS. | Push to `main` (selected paths) or manual run |
| `qa.yml` | Runs Lighthouse to keep performance/accessibility/SEO above 90%. | Pull requests or manual run |
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
   npm run dev
   ```
3. Optimise images and build for production:
   ```bash
   npm run build
   ```
4. Deploy the Worker preview when ready:
   ```bash
   npm run deploy:preview
   ```

The image optimisation script expects source assets in `apps/web/public/images/raw` and emits AVIF/WEBP variants into `apps/web/public/images/optimized`.

## Database setup

Provision a Cloudflare D1 database named `goldshore-db` and copy its ID into `wrangler.toml` under the `[[d1_databases]]` block. Initial seed tables can be created by running:

```bash
wrangler d1 execute goldshore-db --file=packages/db/schema.sql
```

Future Drizzle integration can live in `packages/db` alongside the schema.

## Contact form configuration

The public contact form posts to Formspree after passing Cloudflare Turnstile validation. To finish wiring the production form:

1. Log into the Formspree dashboard and copy the live form endpoint (for example `https://formspree.io/f/abcd1234`).
2. Store the endpoint as a secret so the Worker can forward submissions:
   ```bash
   wrangler secret put FORMSPREE_ENDPOINT
   ```
3. If the site is also deployed via Netlify Functions, add the same value to the site configuration (`FORMSPREE_ENDPOINT`) so the function can read it locally.

Once the secret is present, successful submissions will redirect visitors back to `/#contact-success` and fire a GA4 `contact_form_submit` event for verification.

## Notes

- The Worker deploy relies on the Cloudflare Secrets Store; be sure the store already contains the mapped secrets (`OPENAI_API_KEY`, `OPENAI_PROJECT_ID`, `CF_API_TOKEN`).
- Cloudflare Access automation defaults to allowing `@goldshore.org` addresses. Adjust `ALLOWED_DOMAIN` when running the script if your allowlist differs.
- The AI maintenance workflow is conservative and only opens pull requests when copy changes are suggested. Merge decisions stay in human hands.
- Worker asset environment variables (`PRODUCTION_ASSETS`, `PREVIEW_ASSETS`, `DEV_ASSETS`) map to Cloudflare Pages projects and can be rotated without code changes.
