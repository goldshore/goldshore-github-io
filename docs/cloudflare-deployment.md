# Cloudflare Deployment Playbook

This project can run as a static site (GitHub Pages, Cloudflare Pages, or any CDN) while a Cloudflare Worker handles smart routing and custom-domain protection. Use the following checklist to keep `goldshore.org` serving production traffic without burning Worker invocations on preview branches.

## 1. Static origin

1. Build the site from `main` and publish it to your preferred static host. For Cloudflare Pages, set the project to deploy from this repository.
2. Note the origin hostnames that Cloudflare assigns:
   - **Production** – e.g. `goldshore-org.pages.dev`
   - **Preview** – e.g. `<branch>.goldshore-org.pages.dev`

These origin domains stay on the free tier and do not incur Worker usage.

## 2. Worker configuration

The Worker in `src/router.js` proxies requests to the appropriate origin. Configure its environment variables with Wrangler so only production traffic touches the Worker.

```bash
# Preview (runs on *.workers.dev)
wrangler deploy --env preview

# Production (mapped to the apex + www)
wrangler deploy --env production
```

- `PRODUCTION_ORIGIN` is configured in `wrangler.toml` and should point at the static site that already renders the full experience (e.g. `https://goldshore-org.pages.dev`).
- `PREVIEW_ORIGIN` is set for the preview environment so Git branches stay on the Pages hostname without touching the Worker.
- `CACHE_TTL` (default `300` seconds) keeps the Worker cost low by letting Cloudflare cache responses on GET/HEAD requests.
- `ALLOWED_HOSTNAMES` is a comma-separated allow list enforced in production so only `goldshore.org` routes can consume Worker invocations.
- `CANONICAL_HOSTNAME` controls the redirect target when requests arrive on an unexpected host; set it to `goldshore.org` to collapse stray traffic back to the primary domain.

## 3. Split deployments

1. Point `goldshore.org` and `www.goldshore.org` DNS records at Cloudflare (orange cloud = proxy).
2. In the Workers Routes UI, assign the **production** environment to `goldshore.org/*` and `www.goldshore.org/*` only. Remove any stray domains that would otherwise consume Worker requests.
3. For Cloudflare Pages, ensure the custom domain is attached only to the production deployment. Preview links continue to use the auto-generated `*.pages.dev` hostname and never touch the Worker.

This split keeps Git branches and preview deploys from colliding with the live domain. The Worker simply shields the domain and rewrites upstream traffic while Pages handles the heavy lifting.

## 4. Cost controls

- The Worker runs only on the production routes you assign. Leave preview testing to the free Pages domain.
- Remove any unused wildcard routes (e.g. other domains) if you no longer serve content there—each request would count toward the Worker quota.
- Monitor analytics with the `GOLD_ANALYTICS` dataset; it is already defined in `wrangler.toml`.

With this layout, Cloudflare Pages delivers the site, Workers protects the domain, and billing stays predictable.

## 5. Troubleshooting Cloudflare error 522

If `goldshore.org` ever throws **Cloudflare Error 522 (Connection timed out)**, the CDN reached the origin but GitHub Pages did
not answer within Cloudflare's window. Work through the following checklist:

1. **DNS records** – In Cloudflare DNS, keep only the four GitHub Pages A records on the apex (`@`):
   - `185.199.108.153`
   - `185.199.109.153`
   - `185.199.110.153`
   - `185.199.111.153`

   Each entry should stay **Proxied** (orange cloud). Point `www` at `<org>.github.io` with a proxied CNAME and remove stray A
   records that target other infrastructure.
2. **SSL mode** – On the Cloudflare **SSL/TLS → Overview** screen, set the encryption mode to **Full (Strict)** so Cloudflare
   requires a valid certificate from GitHub Pages.
3. **GitHub Pages custom domain** – In the repository **Settings → Pages** panel, confirm the custom domain reads
   `www.goldshore.org` and that **Enforce HTTPS** is checked. This prompts GitHub Pages to provision the certificate Cloudflare
   validates.

Allow five to ten minutes for DNS propagation, clear the browser cache, and retest `https://www.goldshore.org/`. When these
three items are aligned the 522 timeout clears.
