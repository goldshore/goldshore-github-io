# Gold Shore monorepo

This repository follows the Gold Shore agent playbook: a lightweight monorepo that keeps the Astro site, Cloudflare Worker, and
infrastructure scripts in one place so the CI agent can ship predictable deployments.

## Layout

```
goldshore/
├─ apps/
│  ├─ api-router/      # Cloudflare Worker router
│  └─ web/             # Astro marketing site
├─ packages/
│  └─ image-tools/         # Sharp image optimisation scripts
├─ infra/
│  └─ scripts/         # DNS automation
├─ .github/workflows/  # Deploy + QA pipelines
├─ wrangler.toml       # Worker configuration
└─ package.json        # Workspace scripts for agents
```

### Key files

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

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Astro dev server from `apps/web`. |
| `npm run build` | Optimise images then build the production site. |
| `npm run deploy:prod` | Deploy the Worker to the production environment. |
| `npm run deploy:preview` | Deploy the Worker to the preview environment. |
| `npm run deploy:dev` | Deploy the Worker to the dev environment. |
| `npm run qa` | Execute the local QA helper defined in `.github/workflows/local-qa.mjs`. |

## GitHub Actions

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

## Secrets required in CI

Add the following secrets under **Settings → Secrets and variables → Actions**:

- `CF_API_TOKEN`
- `CF_ACCOUNT_ID`

If either secret is missing the deploy workflow will fail early, prompting the operator to add them before proceeding.

The public contact form posts to Formspree after passing Cloudflare Turnstile validation. To finish wiring the production form:

The Worker expects Cloudflare Pages projects mapped to:

- `goldshore-org.pages.dev` for production
- `goldshore-org-preview.pages.dev` for preview
- `goldshore-org-dev.pages.dev` for development

The DNS upsert script keeps these hostnames pointed at the correct Pages project using proxied CNAME records for:
`goldshore.org`, `www.goldshore.org`, `preview.goldshore.org`, and `dev.goldshore.org`.

- The Worker deploy relies on the Cloudflare Secrets Store; be sure the store already contains the mapped secrets (`OPENAI_API_KEY`, `OPENAI_PROJECT_ID`, `CF_API_TOKEN`).
- Cloudflare Access automation defaults to allowing `@goldshore.org` addresses. Adjust `ALLOWED_DOMAIN` when running the script if your allowlist differs.
- The AI maintenance workflow is conservative and only opens pull requests when copy changes are suggested. Merge decisions stay in human hands.
- Worker asset environment variables (`PRODUCTION_ASSETS`, `PREVIEW_ASSETS`, `DEV_ASSETS`) map to Cloudflare Pages projects and can be rotated without code changes.
