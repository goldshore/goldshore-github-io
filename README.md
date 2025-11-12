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

### Secrets and Environment Variables

Secrets and environment variables are managed using `.dev.vars` for local development and `wrangler secret put` for production environments. Refer to the `.dev.vars.example` file for a list of required variables.
