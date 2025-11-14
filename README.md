# GoldShore Platform Monorepo

Empowering communities through secure, scalable, and intelligent infrastructure. 💻 Built across cybersecurity, cloud, and automation domains.

This monorepo houses the public marketing site, admin console, API workers, automation scripts, and shared packages that keep the GoldShore platform running. Front-ends, workers, and infrastructure code ship together through a single pipeline so releases stay coordinated.

## Prerequisites

- Node.js 20+
- npm 10+
- Cloudflare account with Wrangler access tokens for worker deployments

## Repository layout

```
.
├─ apps/
│  ├─ admin/        # Astro admin console
│  ├─ api/          # Durable Objects + API worker runtime
│  ├─ api-router/   # Edge router forwarding to Pages + workers
│  ├─ api-worker/   # Cloudflare worker that handles GitHub webhooks and APIs
│  └─ web/          # Astro marketing site and asset pipeline scripts
├─ docs/            # Runbooks and internal documentation
├─ infra/           # Cloudflare automation, policies, and cron agents
├─ packages/        # Shared UI, automation, and worker libraries
├─ public/          # Static assets served directly from the platform
├─ scripts/         # Utility scripts (e.g. Codex environment verifier)
├─ wrangler.toml            # Router / API bindings
└─ wrangler.worker.toml     # Legacy worker configuration (reference only)
```

Legacy static assets (`index.html`, `assets/`, `repo/`) remain for reference while the Astro migration completes.

## Installing dependencies

```bash
npm install
```

## Workspace scripts

Run from the repository root:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Launch all workspaces in parallel via Turbo. |
| `npm run build` | Build every workspace. |
| `npm run lint` | Execute lint targets across the monorepo. |
| `npm run typecheck` | Run TypeScript type checking. |
| `npm run deploy` | Execute deploy tasks defined by each workspace. |
| `npm run process:images` | Optimise marketing-site imagery via Sharp. |
| `npm run agent:poll` | Execute the Codex operations poller (Cloudflare + GitHub checks). |
| `npm run enforce:dns` | Reconcile DNS state using the automation script. |
| `npm run validate:codex-config` | Lint limiter configuration before deploying. |

Targeted development commands:

```bash
npm run dev --workspace apps/web          # Marketing site dev server
npm run dev --workspace apps/admin        # Admin console dev server
npm run dev --workspace apps/api-router   # Router worker dev server
npm run dev --workspace apps/api          # Durable Object/API worker tooling
npm run dev:api                           # Cloudflare API worker via Wrangler
npm run dev:site                          # Astro marketing site (single workspace)
```

## Deployment & automation

Production deploys run through GitHub Actions:

- `.github/workflows/cf-deploy.yml` builds workspaces, deploys Pages projects, and rolls out workers.
- `.github/workflows/agent-cron.yml` polls GitHub and Cloudflare to surface drift or failing environments.
- `.github/workflows/apply-policies.yml` enforces Cloudflare, GitHub, and email policies from `infra/policies`.
- `.github/workflows/validate-codex.yml` validates limiter configuration and access controls before rollout.

## Environment & secrets

Use `.dev.vars` (copied from `.dev.vars.example`) for local credentials. The `scripts/verify_codex_env.sh` helper reports missing environment variables before running automation or workers.

Key secrets:

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Authenticates calls to the GPT proxy. |
| `GPT_PROXY_SECRET` / `GPT_PROXY_TOKEN` | Shared secret required for `/api/gpt` requests. |
| `GPT_ALLOWED_ORIGINS` | Comma-separated origins granted CORS access. |
| `FORMSPREE_ENDPOINT` | Destination for the contact form backend. |
| `TURNSTILE_SECRET` | Server-side Cloudflare Turnstile secret. |
| `CF_ACCESS_*` | Optional Cloudflare Zero Trust parameters for protected routes. |

Set secrets with `wrangler secret put` per environment or configure them through your preferred secret manager. `.dev.vars` is ignored by git for local experimentation.

## Keeping `main` fast-forwarded

The production environment deploys directly from `main`. Before opening a PR:

```bash
git fetch origin main
git rebase origin/main
```

Pushes should be fast-forward-only to avoid disrupting deployment workflows.
