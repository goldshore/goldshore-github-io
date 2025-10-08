# Gold Shore implementation playbook

This playbook packages the end-to-end setup for a premium Gold Shore presence—from the UI system and hero animation to
Cloudflare Worker routing, DNS, QA, and admin operations. Every section maps directly to files in the repo so an AI agent or
new contributor can reproduce the stack without guesswork.

## 0. Monorepo layout

```
goldshore/
├─ apps/
│  ├─ api-router/              # Cloudflare Worker router
│  └─ web/                     # Astro site (components, pages, styles)
├─ packages/
│  └─ image-tools/             # Sharp-based optimisation pipeline
├─ infra/                      # DNS + Access scripts
├─ .github/workflows/          # Deploy + QA automation
├─ wrangler.toml               # Worker + routes config
└─ package.json                # Workspace scripts
```

Use the workspace scripts for daily work: `npm run dev` for Astro, `npm run build` for production bundles, and `npm run qa`
to mirror the CI checks before opening a PR. 【F:package.json†L8-L18】

## 1. Theme tokens & skyscraper hero

- Global tokens (colours, spacing, motion) live in `apps/web/src/styles/theme.css`. Import the sheet in any layout to stay on
  brand. 【F:apps/web/src/styles/theme.css†L1-L117】
- The animated “glint” hero is encapsulated in `apps/web/src/components/Hero.astro`, complete with reduced-motion fallbacks. Use
  the `title`, `kicker`, and default slot to customise copy per page. 【F:apps/web/src/components/Hero.astro†L1-L68】
- `apps/web/src/components/Header.astro` provides a responsive header (desktop nav + mobile hamburger). Keep the structure to
  preserve accessibility semantics. 【F:apps/web/src/components/Header.astro†L1-L79】

## 2. Page architecture & SEO

- All pages share `apps/web/src/layouts/Base.astro`, which wires metadata, canonical URLs, OpenGraph/Twitter tags, skip links,
  and footer links. 【F:apps/web/src/layouts/Base.astro†L1-L46】
- Core routes ship with rich content out of the box:
  - Homepage hero + services overview. 【F:apps/web/src/pages/index.astro†L1-L63】
  - About, Team, Services (plus Bridgekeeper/Banproof detail pages) for storytelling depth. 【F:apps/web/src/pages/about.astro†L1-L54】【F:apps/web/src/pages/team.astro†L1-L48】【F:apps/web/src/pages/services/index.astro†L1-L45】
  - Blog index stub pointing to existing repo content. 【F:apps/web/src/pages/blog/index.astro†L1-L36】
  - Contact form scaffold with accessible controls. 【F:apps/web/src/pages/contact.astro†L1-L42】
  - Admin shell marked `noindex` for Cloudflare Access protection. 【F:apps/web/src/pages/admin/index.astro†L1-L39】
  - Privacy and Terms placeholders linked from the footer. 【F:apps/web/src/pages/privacy.astro†L1-L27】【F:apps/web/src/pages/terms.astro†L1-L26】
- Static SEO assets publish in `apps/web/public`, including `robots.txt`, `sitemap.xml`, and the logomark consumed by the header.
  【F:apps/web/public/robots.txt†L1-L3】【F:apps/web/public/sitemap.xml†L1-L12】【F:apps/web/public/logo.svg†L1-L11】

## 3. Image management

- Drop source artwork into `apps/web/public/images/raw`. Run `npm run process-images` (or `npm run build`) to emit optimised
  AVIF + WEBP assets via Sharp. 【F:packages/image-tools/process-images.mjs†L1-L33】
- The build script already chains image optimisation before invoking Astro, so CI and local builds stay consistent. 【F:package.json†L9-L13】

## 4. Accessibility, responsiveness & QA

- Base layout ships a skip link, consistent container spacing, and high-contrast palette baked into `theme.css`. 【F:apps/web/src/layouts/Base.astro†L24-L33】【F:apps/web/src/styles/theme.css†L19-L116】
- Components respect reduced-motion preferences and mobile breakpoints through scoped styles. 【F:apps/web/src/components/Hero.astro†L21-L34】【F:apps/web/src/components/Header.astro†L41-L63】
- `npm run qa` mirrors CI by processing images, installing the Astro workspace, and building the static site; follow the prompt
  to run Lighthouse locally. 【F:.github/workflows/local-qa.mjs†L1-L14】
- CI enforces Lighthouse ≥0.9 for performance, accessibility, and SEO via `.github/workflows/qa.yml`. 【F:.github/workflows/qa.yml†L1-L28】

## 5. Cloudflare Worker & routing

- `apps/api-router/src/router.ts` forwards requests to the correct Pages project based on host prefix and stamps cache headers.
  Adjust the environment variables in `wrangler.toml` when preview origins change. 【F:apps/api-router/src/router.ts†L1-L39】【F:wrangler.toml†L1-L23】
- Immutable caching is applied to hashed assets while HTML stays edge-cached for 10 minutes with stale-while-revalidate support.
  【F:apps/api-router/src/router.ts†L22-L31】

## 6. Deployment workflow

- `.github/workflows/deploy.yml` installs workspaces, builds the site (running Sharp), deploys the Worker to production/preview/dev,
  and syncs DNS. Use `workflow_dispatch` for manual redeploys. 【F:.github/workflows/deploy.yml†L1-L39】

## 7. DNS & domain topology

- `infra/scripts/upsert-goldshore-dns.sh` provisions proxied CNAMEs for apex, `www`, `preview`, and `dev`, matching the Worker
  routes. Override `ZONE_NAME` for sister domains before execution. 【F:infra/scripts/upsert-goldshore-dns.sh†L1-L48】

## 8. Admin access & security

- The admin shell is intentionally static—lock it behind Cloudflare Access with email allowlists or hardware keys. The Worker
  keeps the `x-served-by` header intact for provenance. 【F:apps/web/src/pages/admin/index.astro†L1-L39】【F:apps/api-router/src/router.ts†L32-L36】

## 9. SEO & ads loading

- Every page defines unique titles/descriptions/canonicals through the shared layout. Extend with JSON-LD where needed.
- When introducing ad units, wrap them in containers sized ahead of time and load scripts via `requestIdleCallback` to avoid CLS
  (template snippet lives in this guide).

## 10. Cloudflare Pages environments

- Pages origins are declared per environment in `wrangler.toml`; ensure the three Pages projects (`goldshore-org`, `-preview`,
  `-dev`) stay in sync with GitHub deployments. 【F:wrangler.toml†L1-L23】

## 11. Developer ergonomics

- Quickstart: `npm install`, `npm run dev`, `npm run qa` before submitting PRs.
- Use the workspace deploy scripts (`deploy:prod`, `deploy:preview`, `deploy:dev`) for manual Worker pushes. 【F:package.json†L12-L16】

## 12. Launch checklist

1. Update or create content in `apps/web/src/pages`/`components` per sections 1–2.
2. Drop new imagery into `public/images/raw` and run `npm run process-images`.
3. Validate locally with `npm run qa` and spot-check Lighthouse.
4. Push to a branch; GitHub Actions runs `qa.yml` and `deploy.yml` on merge.
5. Confirm DNS + Worker routes via the Cloudflare dashboard and lock `/admin` behind Access.
