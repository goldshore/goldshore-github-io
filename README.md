# GoldShore Monorepo

Empowering communities through secure, scalable, and intelligent infrastructure.
💻 Building tools in Cybersecurity, Cloud, and Automation.
🌐 Visit us at [GoldShoreLabs](https://goldshore.org) — compatible with [goldshore.foundation](https://goldshore.foundation)

## Repository overview

- [`index.html`](index.html) powers the public landing page and wires up Tailwind via CDN, Swiper-powered hero imagery, and the section layout for services, work, team, and contact CTAs.
- [`assets/css/styles.css`](assets/css/styles.css) adds bespoke polish on top of Tailwind (pricing toggle, testimonial glassmorphism, and accessible FAQ toggles).
- [`src/router.js`](src/router.js) is the Cloudflare Worker entry point that proxies static assets to the configured Pages origin while breaking `/api/gpt` traffic out to the API handler.
- [`src/gpt-handler.js`](src/gpt-handler.js) validates authenticated chat requests, enforces CORS, normalises payloads, and relays them to OpenAI's Chat Completions endpoint.
- [`docs/`](docs) collects internal operations notes (Cloudflare Access, implementation guides, etc.) and is the best place to append additional runbooks.

## Frontend (goldshore.org)
The repository is transitioning to a unified monorepo so every service (web, admin, API, agent, and auxiliary workers) can ship from a single source of truth. The workspace layout now follows:

- [`packages/api`](packages/api) – canonical Cloudflare Worker API with consistent CORS handling and queue integration.
- [`packages/web`](packages/web) – Pages deployment for the marketing site (placeholder build until the Astro app is migrated).
- [`packages/admin`](packages/admin) – Admin dashboard served via Cloudflare Pages and protected with Access (placeholder build).
- [`packages/agent`](packages/agent) – AI agent orchestration layer (to be filled with prompt routing, tool adapters, and queues).
- [`packages/workers`](packages/workers) – Event, webhook, and sentiment processors that listen to Cloudflare Queues and Durable Objects.
- [`packages/libs`](packages/libs) – Shared TypeScript libraries (auth, utils, domain models) consumed across workers and front-ends.
- [`packages/sentry`](packages/sentry) – Optional Sentry helpers for error and trace instrumentation.
- [`infra/cf`](infra/cf) – Wrangler binding templates, D1 migrations, and infrastructure scripts for deterministic deployments.
- [`infra/policies`](infra/policies) – Zero Trust policy definitions and Access documentation.

The landing page is a static document served from Cloudflare Pages. Tailwind is sourced from the official CDN, and Swiper is used for lightweight hero carousels so the bundle stays minimal while still supporting accessible motion controls. Key interactive elements include:

- A sticky navigation bar with mobile toggle logic inlined in `index.html`, keeping the DOM small for fast first paint.
- Hero imagery rendered through Swiper slides with pagination controls, giving the brand's "Shaping waves" story a dynamic marquee.
- Clickable "What we deliver" cards that blend gradient overlays with subtle scale transforms from Tailwind utility classes.
- Services, team, and contact sections arranged as semantic sections so screen readers can jump between anchors exposed in the nav.

Tailwind handles most theming, but the custom stylesheet introduces affordances Tailwind does not cover out of the box:

- `.pricing-toggle` switches adopt pill styling, focus-visible rings, and drop shadows to communicate the active state.
- `.testimonial-card` applies a glass blur backdrop, increased padding above medium breakpoints, and consistent FAQ paddings.
- `.faq-question` and `.faq-icon` form an accessible disclosure pattern that uses pseudo-elements to animate the plus/minus indicator while respecting keyboard focus.

## Cloudflare Worker architecture

Traffic for `goldshore.org` hits a Worker (`wrangler.toml` target `goldshore`) before being proxied to the static Pages host. The Worker layer does two jobs:

1. **Asset routing** — `src/router.js` picks the correct origin based on environment variables such as `ASSETS_ORIGIN` or `PRODUCTION_ASSETS`, rewrites the incoming request, and forwards it with cache hints so CDN hits stay warm. Requests to `/api/gpt` short-circuit to the API handler instead of the Pages origin.
2. **GPT proxy** — `src/gpt-handler.js` exposes a locked-down `POST /api/gpt` endpoint. It enforces CORS allowlists, bearer authentication via the `GPT_SHARED_SECRET`, validates supported model names, normalises `messages` arrays, and forwards the payload to OpenAI using the Worker’s `OPENAI_API_KEY`. Errors bubble back with JSON bodies and matching HTTP status codes so clients can react precisely.

### Required secrets and configuration

Set the following per environment using `wrangler secret put` (or provider-specific secret managers):

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Authorises the Worker when calling OpenAI's Responses API. |
| `GPT_SHARED_SECRET` | Bearer token browsers must send when requesting `/api/gpt`. |
| `GPT_ALLOWED_ORIGINS` | Comma-separated origins that receive permissive CORS headers. |
| `CF_ACCESS_AUD` / `CF_ACCESS_ISS` / `CF_ACCESS_JWKS_URL` (optional) | Lock API access behind Cloudflare Zero Trust when required. |
| `FORMSPREE_ENDPOINT` | Submission URL for the contact form backend. |
| `TURNSTILE_SECRET` | Server-side secret for Cloudflare Turnstile verification. |

Use `.dev.vars` (ignored by git) to store throwaway credentials for local previews.

## Keeping `main` in sync

Gold Shore deploys directly from `main`, so contributors should keep their local clone fast-forwarded and push only from that branch.

### One-time setup

```bash
git checkout main
git branch --set-upstream-to=origin/main main
```

### Daily workflow

```bash
# Update local tracking info and fast-forward main
git fetch origin main
git pull --ff-only

# Work, commit, then push straight back to main
git push origin main
```

### Automated helper
```bash
wrangler secret put OPENAI_API_KEY
wrangler secret put GPT_SHARED_SECRET
wrangler secret put GPT_ALLOWED_ORIGINS
```
### Configuring OpenAI credentials

Set the `OPENAI_API_KEY` secret in each Worker environment so the GPT handler
can authenticate with OpenAI:

| Variable | Purpose | How to set |
| --- | --- | --- |
| `FORMSPREE_ENDPOINT` | Destination endpoint provided by Formspree | `wrangler secret put FORMSPREE_ENDPOINT` (or add to `.dev.vars` for local previews) |
| `TURNSTILE_SECRET` | Server-side Turnstile verification secret | `wrangler secret put TURNSTILE_SECRET` (or add to `.dev.vars`) |
| `OPENAI_API_KEY` | Authenticates calls to the `/api/gpt` handler | `wrangler secret put OPENAI_API_KEY` (or add to `.dev.vars`) |
| `GPT_PROXY_SECRET` | Shared secret browsers must send when calling `/api/gpt` | `wrangler secret put GPT_PROXY_SECRET` (or add to `.dev.vars`) |
| `GPT_ALLOWED_ORIGINS` | Comma-separated list of origins that receive CORS access | Define in `wrangler.toml` (`[vars]`) or add to `.dev.vars` |
| `CF_ACCESS_AUD` | Audience identifier expected inside Cloudflare Access JWTs for `/api/gpt` | Define per-environment in `wrangler.toml` or via `wrangler secret put CF_ACCESS_AUD` |
| `CF_ACCESS_ISS` | (Optional) Cloudflare Access issuer URL to pin for JWT validation | Define per-environment in `wrangler.toml` |
| `CF_ACCESS_JWKS_URL` | (Optional) Override for the Cloudflare Access JWKS endpoint | Define per-environment in `wrangler.toml` |
| `GPT_PROXY_SECRET` | Shared secret required by the `/api/gpt` handler | `wrangler secret put GPT_PROXY_SECRET` (or add to `.dev.vars`) |
```bash
wrangler secret put OPENAI_API_KEY
```
Legacy assets remain available while the migration completes:

- [`index.html`](index.html) powers the public landing page and wires up Tailwind via CDN, Swiper-powered hero imagery, and the section layout for services, work, team, and contact CTAs.
- [`assets/css/styles.css`](assets/css/styles.css) adds bespoke polish on top of Tailwind (pricing toggle, testimonial glassmorphism, and accessible FAQ toggles).
- [`src/router.js`](src/router.js) is the Cloudflare Worker entry point that proxies static assets to the configured Pages origin while breaking `/api/gpt` traffic out to the API handler.
- [`src/gpt-handler.js`](src/gpt-handler.js) validates authenticated chat requests, enforces CORS, normalises payloads, and relays them to OpenAI's Chat Completions endpoint.
- [`docs/`](docs) collects internal operations notes (Cloudflare Access, implementation guides, etc.) and is the best place to append additional runbooks.

## Common Cloudflare bindings

Shared Worker bindings, queue definitions, and D1 connections now live in [`infra/cf/bindings.example.toml`](infra/cf/bindings.example.toml). Copy the template into your environment-specific Wrangler files (for example `wrangler.dev.toml`) and replace the placeholder IDs. Secrets such as `OPENAI_API_KEY`, `GOLDSHORE_TURNSTILE_SECRET`, and `GOLDSHORE_JWT_SECRET` must still be injected with `wrangler secret put`.

Initial D1 schema migrations sit under [`infra/cf/sql`](infra/cf/sql) so every deployment converges on the same trading, CRM, and sentiment tables.

## Frontend (goldshore.org)
This repository powers the GoldShore marketing site, Cloudflare Worker router, and maintenance scripts. The project ships as a static Astro site served behind a Cloudflare Worker that protects the production domain while keeping preview deployments inexpensive.

## Project layout

- `apps/web` – Astro front-end for the marketing site and supporting pages.
- `apps/api-router` – Cloudflare Worker that routes traffic to the appropriate Pages origin and stamps cache/Access headers.
- `packages/` – Shared tooling (image processing, AI maintenance helpers, etc.).
- `infra/` – Shell scripts for DNS automation and Access provisioning.
- `docs/` – Deployment playbooks and additional reference material.

Install dependencies with `npm install` and run `npm run dev` to start the Astro site locally. The `npm run build` and `npm run process-images` scripts mirror the CI pipeline.

The landing page is a static document served from Cloudflare Pages. Tailwind is sourced from the official CDN, and Swiper is used for lightweight hero carousels so the bundle stays minimal while still supporting accessible motion controls. Key interactive elements include:

- A sticky navigation bar with mobile toggle logic inlined in `index.html`, keeping the DOM small for fast first paint.
- Hero imagery rendered through Swiper slides with pagination controls, giving the brand's "Shaping waves" story a dynamic marquee.
- Clickable "What we deliver" cards that blend gradient overlays with subtle scale transforms from Tailwind utility classes.
- Services, team, and contact sections arranged as semantic sections so screen readers can jump between anchors exposed in the nav.

Tailwind handles most theming, but the custom stylesheet introduces affordances Tailwind does not cover out of the box:

- `.pricing-toggle` switches adopt pill styling, focus-visible rings, and drop shadows to communicate the active state.
- `.testimonial-card` applies a glass blur backdrop, increased padding above medium breakpoints, and consistent FAQ paddings.
- `.faq-question` and `.faq-icon` form an accessible disclosure pattern that uses pseudo-elements to animate the plus/minus indicator while respecting keyboard focus.

## Cloudflare Worker architecture

Traffic for `goldshore.org` hits a Worker (`wrangler.toml` target `goldshore`) before being proxied to the static Pages host. The Worker layer does two jobs:

1. **Asset routing** — `src/router.js` picks the correct origin based on environment variables such as `ASSETS_ORIGIN` or `PRODUCTION_ASSETS`, rewrites the incoming request, and forwards it with cache hints so CDN hits stay warm. Requests to `/api/gpt` short-circuit to the API handler instead of the Pages origin.
2. **GPT proxy** — `src/gpt-handler.js` exposes a locked-down `POST /api/gpt` endpoint. It enforces CORS allowlists, bearer authentication via the `GPT_SHARED_SECRET`, validates supported model names, normalises `messages` arrays, and forwards the payload to OpenAI using the Worker’s `OPENAI_API_KEY`. Errors bubble back with JSON bodies and matching HTTP status codes so clients can react precisely.

### Required secrets and configuration

For a repeatable routine, run the repository script before and after you commit:

```bash
./scripts/sync-main.sh        # fast-forward local main
./scripts/sync-main.sh --push # push your latest commits
```

The helper ensures you are on `main`, aligns the upstream remote, fast-forwards from the specified remote (default `origin`), and optionally pushes back up. Override the remote or branch with `--remote` / `--branch` if you are mirroring another deployment target.
## `/api/gpt` configuration

The GPT relay worker requires explicit authentication and origin allow-listing. Set the following variables in each Cloudflare Worker environment:
Set the following per environment using `wrangler secret put` (or provider-specific secret managers):

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Authorises the Worker when calling OpenAI's Responses API. |
| `GPT_SHARED_SECRET` | Bearer token browsers must send when requesting `/api/gpt`. |
| `GPT_ALLOWED_ORIGINS` | Comma-separated origins that receive permissive CORS headers. |
| `CF_ACCESS_AUD` / `CF_ACCESS_ISS` / `CF_ACCESS_JWKS_URL` (optional) | Lock API access behind Cloudflare Zero Trust when required. |
| `FORMSPREE_ENDPOINT` | Submission URL for the contact form backend. |
| `TURNSTILE_SECRET` | Server-side secret for Cloudflare Turnstile verification. |

Use `.dev.vars` (ignored by git) to store throwaway credentials for local previews.

## Keeping `main` in sync

Gold Shore deploys directly from `main`, so contributors should keep their local clone fast-forwarded and push only from that branch.

### One-time setup

```bash
git checkout main
git branch --set-upstream-to=origin/main main
```

### Daily workflow
```bash
wrangler secret put OPENAI_API_KEY
wrangler secret put GPT_SHARED_SECRET
wrangler secret put GPT_ALLOWED_ORIGINS
```
### Configuring OpenAI credentials
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
# Update local tracking info and fast-forward main
git fetch origin main
git pull --ff-only

For guidance on broader operational topics (analytics, exit plans, or worker-specific runbooks) explore the documents under [`docs/`](docs) and [`GOLDSHORE_IMPLEMENTATION_GUIDE.md`](GOLDSHORE_IMPLEMENTATION_GUIDE.md).
# Work, commit, then push straight back to main
git push origin main
```

## Continuous integration & deployment

[`turbo.json`](turbo.json) defines build orchestration for every workspace. The root scripts delegate to Turbo so `npm run build`, `npm run lint`, and `npm run typecheck` operate across the monorepo. GitHub Actions now run [`ci.yml`](.github/workflows/ci.yml), which:

1. Installs dependencies and executes `npm run build`, `npm run lint`, and `npm run typecheck`.
2. Deploys the API worker via Wrangler when commits land on `main`.
3. Publishes the `packages/web/dist` and `packages/admin/dist` outputs to their respective Cloudflare Pages projects.

Extend the workflow with additional deploy jobs (Queues consumers, agent runtime) as they migrate into the repository.

### Automated helper

For a repeatable routine, run the repository script before and after you commit:

```bash
./scripts/sync-main.sh        # fast-forward local main
./scripts/sync-main.sh --push # push your latest commits
```

The helper ensures you are on `main`, aligns the upstream remote, fast-forwards from the specified remote (default `origin`), and optionally pushes back up. Override the remote or branch with `--remote` / `--branch` if you are mirroring another deployment target.

---

For guidance on broader operational topics (analytics, exit plans, or worker-specific runbooks) explore the documents under [`docs/`](docs) and [`GOLDSHORE_IMPLEMENTATION_GUIDE.md`](GOLDSHORE_IMPLEMENTATION_GUIDE.md).
curl -X POST "https://goldshore.org/api/gpt" \
  -H "Origin: https://app.goldshore.org" \
  -H "Authorization: Bearer $GPT_SHARED_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "messages": [
          { "role": "user", "content": "Write a Python function that reverses a string." }
        ]
      }'
```

Successful responses return the JSON payload from the OpenAI Chat Completions API. Errors include an explanatory `error` string in the response body.
```json
{
  "model": "gpt-4o-mini",
  "created": 1720000000,
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Gold Shore Labs builds secure, AI-driven tools for cloud, cybersecurity, and automation."
      }
    }
  ]
}
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
CF_API_TOKEN="goldshore"
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
