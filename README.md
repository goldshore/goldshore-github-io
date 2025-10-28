# Gold Shore Labs

Empowering communities through secure, scalable, and intelligent infrastructure.  
💻 Building tools in Cybersecurity, Cloud, and Automation.
🌐 Visit us at [GoldShoreLabs](https://goldshore.org) — compatible with [goldshore.foundation](https://goldshore.foundation)

## `/api/gpt` Worker endpoint

- **Route**: `POST /api/gpt`
- **Handler**: Cloudflare Worker module at [`src/gpt-handler.js`](src/gpt-handler.js)

Incoming requests first enter `apps/api-worker/src/index.ts`, which proxies static assets to the
Pages origin. Requests whose pathname starts with `/api/gpt` are passed to the
GPT handler module, which formats the payload, calls OpenAI's Responses API,
and streams the result back to the client.

### Configuring OpenAI credentials

Set the `OPENAI_API_KEY` secret in each Worker environment so the GPT handler
can authenticate with OpenAI:

| Variable | Purpose | How to set |
| --- | --- | --- |
| `FORMSPREE_ENDPOINT` | Destination endpoint provided by Formspree | `wrangler secret put FORMSPREE_ENDPOINT` (or add to `.dev.vars` for local previews) |
| `TURNSTILE_SECRET` | Server-side Turnstile verification secret | `wrangler secret put TURNSTILE_SECRET` (or add to `.dev.vars`) |
| `OPENAI_API_KEY` | Authenticates calls to the `/api/gpt` handler | `wrangler secret put OPENAI_API_KEY` (or add to `.dev.vars`) |
| `GPT_PROXY_SECRET` | Shared secret browsers must send when calling `/api/gpt` | `wrangler secret put GPT_PROXY_SECRET` (or add to `.dev.vars`) |
| `GPT_ALLOWED_ORIGINS` | Comma-separated list of origins that receive CORS access | Define in `apps/api-worker/wrangler.toml` (`[vars]`) or add to `.dev.vars` |
| `CF_ACCESS_AUD` | Audience identifier expected inside Cloudflare Access JWTs for `/api/gpt` | Define per-environment in `apps/api-worker/wrangler.toml` or via `wrangler secret put CF_ACCESS_AUD` |
| `CF_ACCESS_ISS` | (Optional) Cloudflare Access issuer URL to pin for JWT validation | Define per-environment in `apps/api-worker/wrangler.toml` |
| `CF_ACCESS_JWKS_URL` | (Optional) Override for the Cloudflare Access JWKS endpoint | Define per-environment in `apps/api-worker/wrangler.toml` |
| `GPT_PROXY_SECRET` | Shared secret required by the `/api/gpt` handler | `wrangler secret put GPT_PROXY_SECRET` (or add to `.dev.vars`) |
```bash
wrangler secret put OPENAI_API_KEY
```

For CI/CD pipelines, use the equivalent secret management command (for example
`npx wrangler secret put`, Cloudflare Dashboard > Worker > Settings > Secrets,
or the GitHub Action `cloudflare/wrangler-action` `secrets` input).

### Where to store KV-style configuration

- **Secrets and API keys**: use Cloudflare's encrypted secrets store via `wrangler secret put <NAME>` for each environment. These values are only visible within Cloudflare and to the Worker at runtime. For local development, copy `.dev.vars.example` to `.dev.vars` (already ignored by Git) and fill in throwaway credentials.
- **Worker KV data**: if you need persistent key/value configuration, define a KV namespace in `apps/api-worker/wrangler.toml` (under `kv_namespaces`) and populate it with `wrangler kv:key put`. The namespace contents stay inside Cloudflare's infrastructure, so nothing sensitive is committed to the repo.
- **CI/CD pipelines**: inject the same secrets and KV namespace identifiers through your build provider's secret manager (for example GitHub Actions' encrypted secrets) so automated deploys can bind them without revealing the values in logs or commits.

### GPT handler API
### Supported models

The handler currently supports the following OpenAI model identifiers:

- `gpt-4o-mini`
- `gpt-4o`
- `o4-mini`

You can pass the desired model in the `model` field of the request JSON. The
Worker validates the choice and forwards it to OpenAI.

### Example request

```http
POST /api/gpt HTTP/1.1
Host: goldshore.org
Content-Type: application/json

{
  "model": "gpt-4o-mini",
  "messages": [
    { "role": "system", "content": "You are a concise assistant." },
    { "role": "user", "content": "Summarize Gold Shore Labs." }
  ]
}
```

Requests must include an `X-GPT-Proxy-Token` header whose value matches the `GPT_PROXY_TOKEN` secret; requests missing or presenting the wrong token are rejected before reaching OpenAI. Requests from origins outside `GPT_ALLOWED_ORIGINS` are short-circuited with `403 Forbidden` before the proxy ever talks to OpenAI, ensuring non-whitelisted sites cannot piggyback on the proxy.
Requests must include an `X-API-Key` header whose value matches the `GPT_PROXY_SECRET` secret; requests missing or presenting the wrong token are rejected before reaching OpenAI. Browsers will only receive a permissive CORS header when their `Origin` appears in `GPT_ALLOWED_ORIGINS`, ensuring non-whitelisted sites cannot piggyback on the proxy.
Requests must include an `X-GPT-Proxy-Token` header whose value matches the `GPT_PROXY_TOKEN` secret; requests missing or presenting the wrong token are rejected before reaching OpenAI. Browsers will only receive a permissive CORS header when their `Origin` appears in `GPT_ALLOWED_ORIGINS`, ensuring non-whitelisted sites cannot piggyback on the proxy. When hitting the authenticated Worker hostname (`goldshore-org.admin-77d.workers.dev`), Cloudflare injects a `Cf-Access-Jwt-Assertion` header after the user completes Access authentication—calls without a valid JWT fail with `401`/`403` responses before token verification or OpenAI proxying occurs.

Responses are returned verbatim from OpenAI's `/v1/chat/completions` endpoint. Be sure to configure both `OPENAI_API_KEY` and `GPT_PROXY_SECRET`, and update `GPT_ALLOWED_ORIGINS` in each environment before deploying.

Example `fetch` call from the frontend:
Responses are returned verbatim from OpenAI's `/v1/chat/completions` endpoint. Be sure to configure both `OPENAI_API_KEY` and `GPT_PROXY_SECRET` in each environment before deploying. Clients must include the shared secret via an `x-api-key` header when calling the Worker:

```js
await fetch("/api/gpt", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-api-key": "<your-matched-secret>",
  },
  body: JSON.stringify({
    prompt: "Write a Python function that returns the factorial of n",
    purpose: "coding",
  }),
});
```

## Cloudflare Zero Trust GitHub Access integration

Gold Shore Labs authenticates internal apps with Cloudflare Access using GitHub as an identity provider. When rotating secrets or onboarding new environments, follow these steps to re-establish the OAuth handshake:

1. Sign in to GitHub and navigate to **Settings → Developer settings → OAuth Apps**.
2. Register a new OAuth application (or update the existing one) using the team domain `https://goldshore.cloudflareaccess.com` for the homepage URL.
3. Set the authorization callback URL to `https://goldshore.cloudflareaccess.com/cdn-cgi/access/callback`.
4. Note the generated **Client ID** and **Client Secret**; rotate the secret if none is available.
5. In Cloudflare Zero Trust, open **Settings → Authentication → Login methods** and add or edit the GitHub provider.
6. Paste the GitHub Client ID into the **App ID** field and the Client Secret into **Client secret**, then save.
7. Use the **Test** button next to the GitHub login method to confirm end-to-end authentication (log into GitHub first if MFA is enabled).

For API-driven deployments, the following environment values are required by automation:

```
GH_APP_ID=<numeric GitHub App ID>
GH_APP_INSTALLATION_ID=<installation identifier>
GH_CLIENT_ID=<public OAuth client ID>
GH_APP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

Update these secrets anywhere they are referenced (GitHub Actions, Cloudflare Workers, or Pages projects) whenever the OAuth app is rotated.

## Swiss-Army Critique Pipeline

The `critique-worker/` folder contains a Cloudflare Workers + Queues + R2 pipeline that turns inbound email into automated website, portfolio, or social critiques. High-level flow:
    "x-api-key": "your-shared-secret",
  },
  body: JSON.stringify({
    purpose: "coding",
    prompt: "Write a Python function that returns the factorial of n",
  }),
});
```

Requests missing the header (or using the wrong secret) are rejected with HTTP 401.
### Example response

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
```

## `/api/gpt` configuration

The GPT relay worker requires explicit authentication and origin allow-listing. Set the following variables in each Cloudflare Worker environment:

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | Server-side OpenAI API key used to fulfil chat completions. |
| `GPT_SERVICE_TOKEN` | Bearer token that callers must present in the `Authorization: Bearer <token>` header. |
| `GPT_ALLOWED_ORIGINS` | Comma-separated list of origins permitted to call the endpoint (e.g. `https://goldshore.org,https://www.goldshore.org`). |

Requests without a matching `Origin` header or a valid bearer token receive `403`/`401` responses. Update any front-end client to supply the configured token when posting to `/api/gpt`.

You are an expert JavaScript and Git assistant. Your role is to complete code inside the `$FILENAME` file where [CURSOR] appears. You must return the most likely full completion, without asking for clarification, summarizing, or greeting the user.

• Respect existing formatting and style.  
• If [CURSOR] is in a comment block, continue that documentation.  
• If it’s within a config or JSON file, complete only valid syntax.  
• If it’s in a `.js` file, complete functions, objects, or exports.  
• If after punctuation or space, write full multi-line completions.  

Never return nothing. Never ask questions. Just finish the thought.

---

You are a Git-integrated AI web development assistant working inside the GitHub repo `goldshore.github.io`.

**Context:**
- The brand is **Gold Shore Labs**
- Project: A modular site showcasing AI tools, cybersecurity R&D, digital consulting, field ops, and identity-based tech
- Audience: Developers, researchers, entrepreneurs, creatives, institutional partners
- Tone: Futuristic, mythic, hybrid enterprise--mix of serious and surreal
- Goal: Present portfolio, issue signals, publish updates, and link internal projects

---

**Task Types:**
1. Generate HTML/CSS/JS for high-concept, visually rich single-page sites
2. Maintain performance (low TTI, compressed assets, dark/light mode pref)
3. Build sliders, project cards, and language-icon tiles (JS, Python, Bash, etc.)
4. Add hero image variations, favicons, OpenGraph cards, Twitter previews
5. Implement responsive design via Tailwind CSS or custom grid/flex
6. Integrate minimal JS carousels or Swiper sliders for past works
7. Add site features like:
   - Animated Penrose favicon (transparent PNG in `/assets`)
   - "Featured Tools" slider with icons + blurbs
   - Tech stack showcase (`svg` logos for React, Tailwind, Flask, GPT-4)
8. Generate README.md with project purpose, usage, and deployment info

---

**Constraints:**
- Output only static front-end (for GitHub Pages)
- Repo should stay portable, self-contained, and visually legible
- Avoid large JS libs unless lazy-loaded
- AI-generated images should go in `/assets/ai/`
- Logos and favicon: `/assets/penrose/`, `/assets/logo/`
- All links must use relative paths (no `file:///` or absolute `/Users/...`)
- All commits go to `main` branch unless directed

---

**Preferred Design Language:**
- Grid or flex-based layout with subtle shadow, glassmorphic containers
- Smooth transitions, consistent spacing, alt text on every img
- Modular components (`card`, `hero`, `tile`, `nav`, `footer`)
- Copy tone: poetic + precise; taglines = signal phrases

---

**Examples of valid input:**
- "Add slider showing recent AI builds using Swiper"
- "Replace placeholder favicon with transparent Penrose icon"
- "Create mosaic of logos: React, Next.js, Tailwind, Python, GPT"
- "Fix iPhone scaling on dark mode"
- "Generate README with site goals and project list"
- "Auto-deploy to goldshore.github.io from `main` via GitHub Actions"
- "Create metadata for SEO + Twitter card"

---

**Response Format:**
- Markdown-rendered code
- Commit message suggestion
- Optional GitHub Actions snippet or `.env` values if needed

---

**GitHub Repo Environment:**
- Branch: `main`  
- Root: `~/goldshore.github.io/`  
- Primary Files:  
  - `index.html`  
  - `styles.css`  
  - `README.md`  
  - `/assets/logo/`, `/assets/penrose/`  
  - `/assets/ai/` (AI-generated content)  
  - `.github/workflows/deploy.yml` (if CI enabled)

--
# Gold Shore monorepo

This repository follows the Gold Shore agent playbook: a lightweight monorepo that keeps the Astro site, Cloudflare Worker, and
infrastructure scripts in one place so the CI agent can ship predictable deployments.

## Layout

```
goldshore/
├─ apps/
│  ├─ api-worker/      # Cloudflare Worker API/router project
│  └─ site/            # Cloudflare Pages (Astro) marketing site + functions
├─ packages/
│  └─ image-tools/         # Sharp image optimisation scripts
├─ infra/
│  └─ scripts/             # DNS & Access automation
├─ .github/workflows/      # Deploy / maintenance CI
└─ package.json            # npm workspaces + shared tooling
```

### Key files

- `apps/api-worker/src/index.ts` — Worker proxy that selects the correct asset origin per host and stamps immutable cache headers for assets.
- `apps/site/src` — Astro site with a shared theme (`styles/theme.css`), reusable components, and hero animation.
- `apps/site/functions/api/contact.js` — Cloudflare Pages Function that verifies Turnstile responses and relays the contact form to Formspree.
- `packages/image-tools/process-images.mjs` — Sharp pipeline that emits AVIF/WEBP variants before every build.
- `infra/scripts/*.sh` — Shell scripts that upsert required DNS records and ensure Cloudflare Access policies for `/admin`.

For a deeper end-to-end playbook that covers design, accessibility, deployment, DNS, and Cloudflare configuration, see [GoldShore Web & Worker Implementation Guide](./GOLDSHORE_IMPLEMENTATION_GUIDE.md).
For a deeper end-to-end playbook that covers design, accessibility, deployment, DNS, and Cloudflare configuration, see [Gold Shore implementation playbook](./GOLDSHORE_IMPLEMENTATION_GUIDE.md).

## Workflows

| Workflow | Purpose | Trigger |
| --- | --- | --- |
| `deploy.yml` | Builds the Astro site, deploys the Worker to `production`, `preview`, and `dev`, then syncs DNS. | Push to `main` (selected paths) or manual run |
| `qa.yml` | Runs Lighthouse to keep performance/accessibility/SEO above 90%. | Pull requests or manual run |
| `ai_maint.yml` | Runs linting, Lighthouse smoke tests, and guarded AI copy suggestions that open PRs. | Nightly (05:00 UTC) or manual run |
| `sync_dns.yml` | Manually replays the DNS upsert script. | Manual run |

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Astro dev server from `apps/site`. |
| `npm run build` | Optimise images then build the production site. |
| `npm run deploy:pages` | Deploy the Astro site to Cloudflare Pages (`goldshore-org`). |
| `npm run deploy:worker` | Deploy the API Worker (`api-goldshore`). |
| `npm run qa` | Execute the local QA helper defined in `.github/workflows/local-qa.mjs`. |

## GitHub Actions

- `CF_ACCOUNT_ID`
- `CF_API_TOKEN`
- `CF_SECRET_STORE_ID`
- `OPENAI_API_KEY`
- `OPENAI_PROJECT_ID`

These secrets are consumed by the Worker (via the Secrets Store binding) and GitHub Actions. The deploy workflow also expects `jq` (available on the GitHub Actions runner).

## Local development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start Astro locally:
   ```bash
   npm run dev
   ```
3. Optimise images and build for production:
   ```bash
   npm run build
   ```
4. Deploy the Worker when ready:
   ```bash
   npm run deploy:worker
   ```

## Secrets required in CI

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start Astro locally:
   ```bash
   cd apps/site
   npm install
   npm run dev
   ```
3. Deploy the Worker when ready:
   ```bash
   cd apps/api-worker
   wrangler dev
   ```

- `CF_API_TOKEN`
- `CF_ACCOUNT_ID`

If either secret is missing the deploy workflow will fail early, prompting the operator to add them before proceeding.

Provision a Cloudflare D1 database named `goldshore-db` and copy its ID into `apps/api-worker/wrangler.toml` under the `[[d1_databases]]` block if you attach it to the Worker in the future. Initial seed tables can be created by running:
The public contact form posts to Formspree after passing Cloudflare Turnstile validation. To finish wiring the production form:

The Worker expects Cloudflare Pages projects mapped to the appropriate origins via `PRODUCTION_ASSETS`, `PREVIEW_ASSETS`, and `DEV_ASSETS` variables in `apps/api-worker/wrangler.toml`.

Example Worker binding block:

```toml
[[d1_databases]]
binding = "DB"
database_name = "goldshore-db"
database_id = "DATABASE_ID"
```

Future Drizzle integration can live in `packages/db` alongside the schema.

The DNS upsert script keeps these hostnames pointed at the correct Pages project using proxied CNAME records for:
`goldshore.org`, `www.goldshore.org`, `preview.goldshore.org`, and `dev.goldshore.org`.

- The Worker deploy relies on the Cloudflare Secrets Store; be sure the store already contains the mapped secrets (`OPENAI_API_KEY`, `OPENAI_PROJECT_ID`, `CF_API_TOKEN`).
- Run Worker commands from `apps/api-worker` so Wrangler automatically reads the colocated `wrangler.toml`, while Cloudflare Pages commands execute from `apps/site` and read its own configuration file.
- Cloudflare Access automation defaults to allowing `@goldshore.org` addresses. Adjust `ALLOWED_DOMAIN` when running the script if your allowlist differs.
- The AI maintenance workflow is conservative and only opens pull requests when copy changes are suggested. Merge decisions stay in human hands.
- Worker asset environment variables (`PRODUCTION_ASSETS`, `PREVIEW_ASSETS`, `DEV_ASSETS`) accept either a single origin or a comma-separated list. The router will select the first valid HTTPS origin and will automatically prepend `https://` when a scheme is omitted, which makes it easy to rotate between legacy and renamed domains without downtime.
