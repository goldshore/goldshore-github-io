# GoldShore Implementation Guide

This guide provides a comprehensive overview of the GoldShore repository, including its architecture, design principles, and deployment processes. It is intended to be a living document that evolves with the project.

## 1. Repository Overview

The GoldShore repository is a monorepo built with npm workspaces. It contains the following applications and packages:

-   **`apps/web`**: The main marketing website, built with Astro.
-   **`apps/admin`**: The admin dashboard, also built with Astro and protected by Cloudflare Access.
-   **`apps/api-worker`**: The Cloudflare Worker that serves as the API for the platform.
-   **`packages/*`**: Shared packages and libraries used across the different applications.

## 2. Design and Build Process

### 2.1. Layout and Component Planning

-   New Astro pages should be created in `apps/web/src/pages` or `apps/admin/src/pages`.
-   Reusable components should be placed in the `src/components` directory of the respective application.
-   The design system is based on Tailwind CSS.

### 2.2. Accessibility

-   Ensure that all new components and pages are accessible.
-   Use semantic HTML and ARIA attributes where appropriate.
-   Test for accessibility using browser extensions and other tools.

### 2.3. Responsive Design

-   All pages and components should be responsive and work on a variety of screen sizes.
-   Use Tailwind's responsive utility classes to create responsive layouts.

## 3. Cloudflare Worker and Deployment

### 3.1. Environment Separation and Routing

-   The Cloudflare Worker (`apps/api-worker`) handles API requests.
-   The `wrangler.worker.toml` file contains the configuration for the worker, including routes, bindings, and environment variables.
-   The worker is deployed to `api.goldshore.org`.

### 3.2. Build and Release Pipeline

-   The CI/CD pipeline is defined in `.github/workflows/ci.yml`.
-   When changes are pushed to the `main` branch, the pipeline automatically builds and deploys the applications to Cloudflare.
-   The `web` and `admin` applications are deployed to Cloudflare Pages.
-   The `api-worker` is deployed to Cloudflare Workers.

### 3.3. Security and Observability

-   The `admin` application is protected by Cloudflare Access.
-   The API worker implements CORS and rate limiting.
-   Observability is enabled for the worker, and logs and analytics are available in the Cloudflare dashboard.

## 4. Asset and Image Management

-   Source images are located in the `public/images/raw` directory of the `apps/web` application.
-   A script is used to process and optimize the images before deployment.

## 5. Domain Architecture and DNS

-   **`goldshore.org`**: The main marketing website.
-   **`admin.goldshore.org`**: The admin dashboard.
-   **`api.goldshore.org`**: The API worker.
-   DNS is managed in the Cloudflare dashboard. The `infra/scripts/enforce-dns.sh` script can be used to assert that the correct DNS records are in place.

## 6. Development Workflow

1.  Create a new branch for your changes.
2.  Make your changes in the appropriate application or package.
3.  Run `npm run lint` and `npm run typecheck` to check for errors.
4.  Run `npm run build` to ensure that the applications build successfully.
5.  Push your changes and open a pull request.
6.  Once the pull request is approved and merged, the changes will be automatically deployed to production.
