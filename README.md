# GoldShore Monorepo

Empowering communities through secure, scalable, and intelligent infrastructure.
💻 Building tools in Cybersecurity, Cloud, and Automation.
🌐 Visit us at [GoldShoreLabs](https://goldshore.org)

## Repository Overview

This repository is a monorepo containing the applications and packages that power the GoldShore platform. It is built using a modern stack of TypeScript, Astro, and Cloudflare Workers.

### Project Structure

The repository is organized into the following workspaces:

-   `apps/web`: The main marketing website, built with Astro.
-   `apps/admin`: The admin dashboard, also built with Astro and protected by Cloudflare Access.
-   `apps/api-worker`: The Cloudflare Worker that serves as the API for the platform.
-   `packages/*`: Shared packages and libraries used across the different applications.

## Getting Started

### Prerequisites

-   [Node.js](https://nodejs.org/) (version >=22.0.0)
-   [npm](https://www.npmjs.com/) (version >=10.0.0)
-   [Wrangler](https://developers.cloudflare.com/workers/wrangler/get-started/) (Cloudflare CLI)

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/GoldShore/goldshore.git
    ```
2.  Install the dependencies from the root of the repository:
    ```bash
    npm install
    ```

### Development

To start the development servers for all the applications in parallel, run the following command from the root of the repository:

```bash
npm run dev
```

This will start the Astro development server for the `web` and `admin` apps, and the Wrangler development server for the `api-worker`.

## Building and Deployment

### Building

To build all the applications for production, run the following command from the root of the repository:

```bash
npm run build
```

This will create optimized builds for the `web` and `admin` apps in their respective `dist` directories, and build the `api-worker`.

### Deployment

Deployment is handled automatically by the CI/CD pipeline, which is configured in `.github/workflows/ci.yml`. When changes are pushed to the `main` branch, the following actions are performed:

1.  The applications are built and tested.
2.  The `api-worker` is deployed to Cloudflare Workers.
3.  The `web` and `admin` applications are deployed to Cloudflare Pages.

For manual deployments, you can use the `wrangler` CLI. Refer to the `wrangler.toml` and `wrangler.worker.toml` files for configuration details.

## Cloudflare Configuration

The Cloudflare configuration is split into two files:

-   `wrangler.toml`: Configures the Cloudflare Pages deployment for the `web` application.
-   `wrangler.worker.toml`: Configures the Cloudflare Worker deployment for the `api-worker` application.

### Secrets and Environment Variables

Secrets and environment variables are managed using `.dev.vars` for local development and `wrangler secret put` for production environments. Refer to the `.dev.vars.example` file for a list of required variables.
