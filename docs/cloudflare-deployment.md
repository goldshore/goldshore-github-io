# Cloudflare Deployment Playbook

This project can run as a static site (GitHub Pages, Cloudflare Pages, or any CDN) while a Cloudflare Worker handles smart routing and custom-domain protection. Use the following checklist to keep `goldshore.org` serving production traffic without burning Worker invocations on preview branches.

## 1. Static origin

1. Build the site from `main` and publish it to your preferred static host. For Cloudflare Pages, set the project to deploy from this repository.
2. Note the origin hostnames that Cloudflare assigns:
   - **Production** – e.g. `goldshore-org.pages.dev`
   - **Preview** – e.g. `<branch>.goldshore-org.pages.dev`

These origin domains stay on the free tier and do not incur Worker usage.

## 2. Worker configuration

The Worker in `apps/api-worker/src/index.ts` proxies requests to the appropriate origin. Configure its environment variables with Wrangler so only production traffic touches the Worker.

```bash
cd apps/api-worker
wrangler deploy
```

- `PRODUCTION_ASSETS`, `PREVIEW_ASSETS`, and `DEV_ASSETS` are configured in `apps/api-worker/wrangler.toml` and should point at the static Pages projects that render the full experience (e.g. `https://goldshore-org.pages.dev`).
- Use Wrangler secrets (for example `wrangler secret put OPENAI_API_KEY`) to keep GPT credentials and contact form endpoints out of version control; the config file only stores non-sensitive defaults under `[vars]`.
- `GPT_ALLOWED_ORIGINS` is a comma-separated allow list enforced so only approved front-ends can consume Worker invocations.
- `CACHE` directives are set inside the Worker response to keep static assets immutable while letting HTML revalidate quickly; adjust them in `apps/api-worker/src/index.ts` if product requirements change.

## 3. Split deployments

1. Point `goldshore.org` and `www.goldshore.org` DNS records at Cloudflare (orange cloud = proxy).
2. In the Workers Routes UI, assign the **production** environment to `goldshore.org/*` and `www.goldshore.org/*` only. Remove any stray domains that would otherwise consume Worker requests.
3. For Cloudflare Pages, ensure the custom domain is attached only to the production deployment. Preview links continue to use the auto-generated `*.pages.dev` hostname and never touch the Worker.

This split keeps Git branches and preview deploys from colliding with the live domain. The Worker simply shields the domain and rewrites upstream traffic while Pages handles the heavy lifting.

## 4. Cost controls

- The Worker runs only on the production routes you assign. Leave preview testing to the free Pages domain.
- Remove any unused wildcard routes (e.g. other domains) if you no longer serve content there—each request would count toward the Worker quota.
- Monitor analytics with the `GOLD_ANALYTICS` dataset; define any bindings in `apps/api-worker/wrangler.toml` before deploying.

With this layout, Cloudflare Pages delivers the site, Workers protects the domain, and billing stays predictable.
