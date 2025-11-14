# Gold Shore monorepo

Gold Shore keeps the marketing site, Cloudflare Workers router, scheduled jobs, and infrastructure helpers in a single workspace so every deploy ships the same way in CI and on local machines. The repo hosts the public Astro site, an `/api/gpt` proxy backed by the OpenAI Chat Completions API, and automation scripts for DNS, secrets, and worker maintenance.

## Repository layout

```
goldshore/
├─ apps/
│  ├─ api-router/          # Cloudflare Worker that selects the right asset origin per host
│  └─ web/                 # Astro marketing site and content
├─ packages/
│  └─ image-tools/         # Sharp-based image optimisation pipeline
├─ functions/              # Cloudflare Pages Functions (contact form handler)
├─ infra/                  # Scripts for DNS, Access, and other operational chores
├─ src/                    # Root Worker modules mounted by wrangler.toml
└─ package.json            # npm workspaces + shared tooling
```

See the [Gold Shore Web & Worker Implementation Guide](./GOLDSHORE_IMPLEMENTATION_GUIDE.md) for the long-form playbook covering design, accessibility, deployment, DNS, and secrets rotation.

## Applications

### Astro marketing site (`apps/web`)
- Built with Astro 4.
- Shared theme lives in `apps/web/src/styles/theme.css`; layouts and reusable components are in `apps/web/src/components/`.
- Development: `npm run dev` (from repo root or inside `apps/web`).
- Production build: `npm run build` – optimises images first, then runs `astro build`.

### Worker router (`apps/api-router` and `src/router.js`)
- Receives all Cloudflare Worker traffic and proxies static assets to the correct Pages deployment (`production`, `preview`, `dev`).
- Environment variables `PRODUCTION_ASSETS`, `PREVIEW_ASSETS`, and `DEV_ASSETS` can override the default Pages domains; the Worker stamps cache headers on proxied responses.
- Requests to `/api/gpt` are forwarded to the GPT proxy handler described below.

### Contact function (`functions/api/contact.js`)
- Validates Cloudflare Turnstile tokens before relaying submissions to Formspree.
- Requires `TURNSTILE_SECRET` and `FORMSPREE_ENDPOINT` environment variables in each Pages environment (`.dev.vars` locally).

### Image tooling (`packages/image-tools`)
- `npm run build` executes `packages/image-tools/process-images.mjs` to emit AVIF/WEBP variants prior to the Astro build.
- The script depends on `sharp`; install dependencies with `npm install` before running.

## Local development

1. Install Node.js 18+.
2. Install workspace dependencies:
   ```bash
   npm install
   ```
3. Start the Astro dev server:
   ```bash
   npm run dev
   ```
4. Build for production (images + Astro output):
   ```bash
   npm run build
   ```

## Deployment commands

| Command | Description |
| --- | --- |
| `npm run deploy:prod` | Deploy the Worker using the `production` environment in `wrangler.worker.toml`. |
| `npm run deploy:preview` | Deploy the Worker to the preview environment. |
| `npm run deploy:dev` | Deploy the Worker to the dev environment. |
| `npm run qa` | Execute the local QA helper (`.github/workflows/local-qa.mjs`). |

## `/api/gpt` proxy handler

`src/gpt-handler.js` exposes a minimal wrapper around OpenAI's Chat Completions API:

- Only `POST` and `OPTIONS` methods are supported.
- Calls must authenticate with a shared secret provided via either the `x-api-key` header or an `Authorization: Bearer <token>` header.
- CORS is restricted to the origins defined in `GPT_ALLOWED_ORIGINS` (comma-separated). Requests from non-allowed origins are rejected before reaching OpenAI.
- The handler accepts either a `messages` array or a simple `prompt` string and forwards a validated payload to OpenAI.
- Streaming responses are passed through unchanged; non-streaming responses are returned as JSON with CORS headers applied.

### Required environment variables

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Server-side key used when talking to OpenAI. |
| `GPT_PROXY_SECRET` (or `GPT_SERVICE_TOKEN`) | Shared secret expected in the auth header. |
| `GPT_ALLOWED_ORIGINS` | Comma-separated list of allowed browser origins. |
| `CF_ACCESS_AUD` / `CF_ACCESS_ISS` / `CF_ACCESS_JWKS_URL` | Optional Cloudflare Access claims for hardening authenticated worker hostnames. |

## Cloudflare Zero Trust + DNS automation

Automation scripts in `infra/scripts/` keep DNS and Access policies aligned with deployed environments. Ensure the following GitHub Actions secrets exist so CI can execute deploy workflows:

- `CF_ACCOUNT_ID`
- `CF_API_TOKEN`
- `CF_SECRET_STORE_ID`
- `OPENAI_API_KEY`
- `OPENAI_PROJECT_ID`

The DNS helper keeps `goldshore.org`, `www.goldshore.org`, `preview.goldshore.org`, and `dev.goldshore.org` pointing at the correct Pages projects with proxied CNAME records.

## Contact and support

- Email `intake@goldshore.org` for partnership requests and `privacy@goldshore.org` for data questions.
- Internal operators should reference the Implementation Guide for step-by-step environment setup, including Cloudflare Access OAuth configuration with GitHub.
# GoldShore Monorepo

Empowering communities through secure, scalable, and intelligent infrastructure.
💻 Building tools in Cybersecurity, Cloud, and Automation.
🌐 Visit us at [GoldShoreLabs](https://goldshore.org)

## Repository Overview

This repository is a monorepo containing the applications and packages that power the GoldShore platform. It is built using a modern stack of TypeScript, Astro, and Cloudflare Workers.

### Project Structure

The repository is organized into the following workspaces:

-   `apps/goldshore-web`: The main marketing website, built with Astro.
-   `apps/goldshore-admin`: The admin dashboard, also built with Astro and protected by Cloudflare Access.
-   `apps/goldshore-api`: The Cloudflare Worker that serves as the API for the platform.
-   `apps/goldshore-agent`: A Cloudflare Worker for background jobs and queues.
-   `packages/ui`: Shared UI components and design tokens.
-   `packages/config`: Shared configuration files (tsconfig, eslint).
-   `packages/utils`: Shared utility functions.
-   `packages/auth`: Helpers for Cloudflare Access authentication.
-   `infra/cloudflare`: Cloudflare-related infrastructure configurations (wrangler.toml, bindings).
-   `infra/github`: GitHub Actions workflows.


## Getting Started

### Prerequisites

-   [Node.js](https://nodejs.org/) (version >=22.0.0)
-   [pnpm](https://pnpm.io/)
-   [Wrangler](https://developers.cloudflare.com/workers/wrangler/get-started/) (Cloudflare CLI)

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/GoldShore/goldshore.git
    ```
2.  Install the dependencies from the root of the repository:
    ```bash
    pnpm install
    ```

### Development

To start the development servers for all the applications in parallel, run the following command from the root of the repository:

```bash
pnpm run dev
```

This will start the Astro development server for the `web` and `admin` apps, and the Wrangler development server for the `api` and `agent` workers.

## Workspace Scripts

Each workspace has a consistent set of scripts:

- `pnpm dev`: Starts the development server.
- `pnpm build`: Builds the application for production.
- `pnpm preview`: Previews the production build locally.
- `pnpm deploy`: Deploys the application to Cloudflare.


## Building and Deployment

### Building

To build all the applications for production, run the following command from the root of the repository:

```bash
pnpm run build
```

This will create optimized builds for the `web` and `admin` apps in their respective `dist` directories, and build the `api` and `agent` workers.

### Deployment

Deployment is handled automatically by the CI/CD pipeline, which is configured in `infra/github/actions`. When changes are pushed to the `main` branch, the following actions are performed:

1.  The applications are built and tested.
2.  The `goldshore-api` and `goldshore-agent` workers are deployed to Cloudflare Workers.
3.  The `goldshore-web` and `goldshore-admin` applications are deployed to Cloudflare Pages.

For manual deployments, you can use the `wrangler` CLI. Refer to the `wrangler.toml` files within each app for configuration details.

## Cloudflare Configuration

Each application that deploys to Cloudflare has its own `wrangler.toml` file. This file contains the configuration for the application, including routes, bindings, and environment variables.

### Cloudflare Setup

For a first-time setup, refer to the [Cloudflare Setup Guide](infra/cloudflare/SETUP.md). This guide provides a complete walkthrough of the manual steps required to configure the project on Cloudflare.

To automate the provisioning of Cloudflare resources (D1, KV, R2, Queues), you can use the provisioning script:

```bash
bash infra/cloudflare/provision.sh
```

### Secrets and Environment Variables

Secrets and environment variables are managed using `.dev.vars` for local development and `wrangler secret put` for production environments. Refer to the `.dev.vars.example` file for a list of required variables.
