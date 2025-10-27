# GoldShore Web & Worker Implementation Guide

This playbook summarises how the existing GoldShore repository is organised and expands it into a repeatable process for layout design, accessibility, responsive behaviour, SEO, monetisation, admin operations, and Cloudflare deployment. Each section references concrete source files so the team can evolve the system with confidence.

## 1. Repository & workflow overview
- Treat the repo as a single monorepo with discrete workspaces for the Worker, Astro front-end, D1 schema, and automation scripts as outlined in the root README. 【F:README.md†L1-L28】
- Shipping the platform relies on three GitHub Actions workflows: `deploy.yml` for multi-environment releases, `ai_maint.yml` for nightly QA/AI curation, and `sync_dns.yml` for manual DNS replays. 【F:README.md†L29-L35】
- Use the npm scripts defined at the workspace root (`build:web`, `process-images`) as the canonical build entry points that the CI pipeline already calls. 【F:package.json†L1-L17】【F:.github/workflows/deploy.yml†L33-L43】

## 2. Design & build process
### 2.1 Layout & component planning
- Start new Astro pages in `apps/web/src/pages`, modelling the hero/CTA structure after the current homepage stub for consistent typography, button styles, and CTA placement. 【F:apps/web/src/pages/index.astro†L1-L41】
- The Store landing page demonstrates a complete layout system (sticky header, hero grid, themed sections) implemented with Tailwind via CDN—use it as a reference for section rhythm, spacing, and component density. 【F:store.html†L1-L188】
- The `/repo` microsite showcases advanced marketing storytelling with sliders and CTA cards; mirror its structural patterns when building narrative-heavy pages. 【F:repo/index.html†L1-L120】

### 2.2 Accessibility guardrails
- Maintain skip links, focus states, and labelled controls as seen on the Store and Repo pages; every new layout should expose a “Skip to content” anchor and aria-labelled nav toggles. 【F:store.html†L31-L66】【F:repo/index.html†L21-L59】
- For gated/admin UIs, keep form controls semantically labelled (see the `tiers.html` prototype) and extend with descriptive helpers before promoting to production. 【F:tiers.html†L1-L4】

### 2.3 Responsive design
- Use the existing Tailwind responsive classes (`sm:`, `md:`, `lg:`) from `store.html` as the baseline for breakpoints, ensuring navigation collapses below `md` and multi-column grids adapt to single-column stacks on small screens. 【F:store.html†L34-L188】
- When authoring Astro components, match the grid utilities already used on the homepage (`grid grid-2`) until the shared theme is expanded; this keeps the responsive rules consistent across native Astro and static HTML surfaces. 【F:apps/web/src/pages/index.astro†L17-L37】

### 2.4 Content, SEO & analytics
- Preserve rich metadata per page (title, description, OpenGraph image) following the Store page template to guarantee social sharing parity across microsites. 【F:store.html†L3-L29】
- Serve an `ads.txt` at the root with verified seller IDs; update it whenever ad partnerships change to maintain compliance. 【F:ads.txt†L1-L1】
- Model CMS-backed content schemas on the existing D1 tables (`posts`, `products`) so blog entries and store items can be generated from structured data. 【F:packages/db/schema.sql†L1-L15】

### 2.5 Monetisation & advertising integrations
- Embed tailored CTAs (e.g. “Request Access Code”, “Preview repo”) from the Store layout to drive conversions while keeping copy accessible. 【F:store.html†L73-L188】
- Any third-party advertising or affiliate scripts should load lazily and respect the accessibility guardrails above; document the partner in `ads.txt` and mirror consent language inside relevant CTA blocks.

### 2.6 Admin dashboard & gated ops
- Protect `/admin` routes via Cloudflare Access; the `rebuild-goldshore-access.sh` script already provisions the self-hosted app and allow policy, so include it in every release cadence and adjust the `ALLOWED_DOMAIN` as access needs evolve. 【F:infra/scripts/rebuild-goldshore-access.sh†L1-L57】
- Admin front-ends should rely on the Worker’s origin routing (see §3) to source environment-specific assets, ensuring staff always validate changes in preview/dev before touching production. 【F:apps/api-router/src/router.ts†L69-L120】

## 3. Cloudflare Worker + GitHub Pages deployment
### 3.1 Environment separation & routing
- The Worker maps incoming hosts to the appropriate Pages origin (`production`, `preview`, `dev`) using environment variables that fall back to default URLs; keep this mapping up to date as domains change. 【F:apps/api-router/src/router.ts†L10-L75】
- For bespoke staging domains, append them to the `PRODUCTION_ASSETS`, `PREVIEW_ASSETS`, or `DEV_ASSETS` variables—wildcards are ignored automatically, so list concrete URLs only. 【F:apps/api-router/src/router.ts†L21-L63】

### 3.2 Build & release pipeline
- GitHub Actions builds the site, runs the image pipeline, and deploys the Worker for each environment in a single matrix job; use this workflow as the source of truth for release sequencing and replicate it locally when debugging. 【F:.github/workflows/deploy.yml†L19-L53】
- Ensure `wrangler.toml` advertises the canonical Worker name (`goldshore-org`) and extend it with bindings (KV, D1, R2) as the stack grows. 【F:wrangler.toml†L1-L3】

### 3.3 Security, testing & observability
- CORS headers are currently mirrored from the request host; before shipping integrations, validate against each frontend origin and consider adding an allowlist lookup to `buildCorsHeaders` to prevent credential leaks. 【F:apps/api-router/src/router.ts†L76-L116】
- Nightly CI already runs linting, Lighthouse, and guarded AI copy edits—treat failures in `ai_maint.yml` as release blockers, and extend the workflow with additional smoke tests for admin dashboards. 【F:.github/workflows/ai_maint.yml†L1-L105】
- Surface Worker provenance downstream by preserving the `x-served-by` header and augmenting logs/analytics collectors accordingly. 【F:apps/api-router/src/router.ts†L112-L120】

### 3.4 Performance & caching strategy
- The Worker currently streams responses without modifying cache headers; layer in `Cache-Control`/`CF-Cache-Status` overrides at the Worker level once asset TTL requirements are defined, ensuring previews stay un-cached while production assets maximise edge storage. 【F:apps/api-router/src/router.ts†L95-L120】
- Pair the build pipeline’s image processing (see §4) with Cloudflare Images or R2 when binaries outgrow GitHub Pages limits.

## 4. Asset & image management
- Source images live in `apps/web/public/images/raw` and are transformed to AVIF/WEBP variants via the Sharp script before each deploy; fix the pipeline reuse bug by cloning the Sharp instance per format when you expand the script. 【F:apps/web/scripts/process-images.mjs†L5-L29】【F:.github/workflows/deploy.yml†L36-L43】
- Document any new asset conventions in the README so the nightly AI maintenance job can lint against them.

## 5. AI-assisted maintenance & product ops
- The `ai_maint.yml` workflow installs linting, runs Lighthouse, and can open copy-polish PRs automatically—use it to maintain tone/consistency and extend it with additional prompt sets for product updates. 【F:.github/workflows/ai_maint.yml†L26-L105】
- House reusable AI orchestration scripts inside `packages/ai-maint`; it is intentionally empty today, so treat it as the nucleus for product management bots (roadmap triage, content refresh, churn risk alerts). 【F:packages/ai-maint/README.md†L1-L5】

## 6. Domain architecture & DNS
### 6.1 Site tree across domains
- **goldshore.org (production)**
  - `/` – Astro homepage scaffold for hero + product navigation. 【F:apps/web/src/pages/index.astro†L1-L41】
  - `/store` – Storefront landing with CTAs, product grids, FAQ sections. 【F:store.html†L1-L188】
  - `/repo` – Portfolio microsite highlighting services and case studies. 【F:repo/index.html†L1-L120】
  - `/tiers` – Prototype admin entry form (extend into full dashboard). 【F:tiers.html†L1-L4】
- **preview.goldshore.org** – Mirrors production content for stakeholders; served by the Worker’s preview origin mapping. 【F:apps/api-router/src/router.ts†L69-L75】
- **dev.goldshore.org** – Developer sandbox with experimental assets and feature flags; route via the Worker’s dev origin mapping. 【F:apps/api-router/src/router.ts†L69-L75】
- **www.goldshore.org** – CNAME alias to the apex handled in the DNS automation script. 【F:infra/scripts/upsert-goldshore-dns.sh†L20-L49】

### 6.2 DNS & SSL management
- Run `infra/scripts/upsert-goldshore-dns.sh` during provisioning to upsert `A`/`CNAME` records for apex, `www`, `preview`, and `dev`—the script is idempotent and Cloudflare-proxied by default. 【F:infra/scripts/upsert-goldshore-dns.sh†L1-L51】
- Use `sync_dns.yml` when records drift; it simply replays the script so infra changes stay version-controlled. 【F:README.md†L29-L35】
- Keep the Worker bound to the same zone so Access, caching, and SSL certificates stay unified across subdomains.

## 7. Implementation checklist
1. Draft/update page designs in Astro or static HTML following §§2.1–2.3.
2. Encode metadata, analytics, and CTAs per §§2.4–2.5.
3. Ensure admin-only features route through Cloudflare Access (§2.6).
4. Update asset sources and run `npm run process-images` (§4).
5. Validate Worker routing and environment variables (§3.1–§3.3).
6. Sync DNS records and confirm certificates (§6.2).
7. Ship via GitHub Actions; verify nightly AI maintenance results (§5).
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
  routes. Override `ZONE` (or legacy `ZONE_NAME`) for sister domains before execution. 【F:infra/scripts/upsert-goldshore-dns.sh†L1-L48】

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
