# Gold Shore Labs

Empowering communities through secure, scalable, and intelligent infrastructure.  
💻 Building tools in Cybersecurity, Cloud, and Automation.
🌐 Visit us at [GoldShoreLabs](https://goldshore.org)

## Cloudflare deployment environments

| Environment | Branch trigger       | Worker route domains                                                                                                                                          | Pages origin                             |
|-------------|----------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------|
| Production  | `main`               | `goldshore.org`<br>`www.goldshore.org`<br>`gearswipe.com`<br>`www.gearswipe.com`<br>`armsway.com`<br>`www.armsway.com`<br>`banproof.com`<br>`www.banproof.com` | `https://goldshore-org.pages.dev`         |
| Preview     | `preview/*` branches | `preview.goldshore.org`<br>`preview.gearswipe.com`<br>`preview.armsway.com`<br>`preview.banproof.com`                                                         | `https://goldshore-org-preview.pages.dev` |
| Development | `dev/*` branches     | `dev.goldshore.org`<br>`dev.gearswipe.com`<br>`dev.armsway.com`<br>`dev.banproof.com`                                                                           | `https://goldshore-org-dev.pages.dev`     |

Use the "Deploy to Cloudflare" workflow to publish updates on demand by selecting the desired environment. API hostnames such as `api.goldshore.org` stay mapped to their dedicated services and are intentionally excluded from the router worker routes. When new marketing hostnames are introduced:

1. Add them to this table and register the same hostname in `wrangler.toml` under the appropriate environment.
2. Avoid `*.<domain>` wildcard routes—those would capture API, SMTP, MX, and other service subdomains that should keep resolving to their dedicated infrastructure instead of the worker router.

## Environment configuration

The `/api/contact` Pages Function depends on two environment variables:

| Variable | Purpose | How to set |
| --- | --- | --- |
| `FORMSPREE_ENDPOINT` | Destination endpoint provided by Formspree | `wrangler secret put FORMSPREE_ENDPOINT` (or add to `.dev.vars` for local previews) |
| `TURNSTILE_SECRET` | Server-side Turnstile verification secret | `wrangler secret put TURNSTILE_SECRET` (or add to `.dev.vars`) |
| `OPENAI_API_KEY` | Authenticates calls to the `/api/gpt` handler | `wrangler secret put OPENAI_API_KEY` (or add to `.dev.vars`) |
| `GPT_PROXY_TOKEN` | Shared secret browsers must send when calling `/api/gpt` | `wrangler secret put GPT_PROXY_TOKEN` (or add to `.dev.vars`) |
| `GPT_ALLOWED_ORIGINS` | Comma-separated list of origins that receive CORS access | Define in `wrangler.toml` (`[vars]`) or add to `.dev.vars` |

Values added with `wrangler secret put` are encrypted and **not** committed to the repository. When running `wrangler pages dev` locally you can copy `.dev.vars.example` to `.dev.vars` and provide temporary development credentials. The public Turnstile site key used in the homepage markup can remain versioned because it is intentionally exposed to browsers.

### Analytics

- Google Analytics 4 measurement ID: `G-6208QFYB08`
- Cloudflare Web Analytics token: set via the `data-cf-beacon` attribute in `index.html`

### GPT handler API

Gold Shore's Worker router exposes a `/api/gpt` endpoint that proxies requests to OpenAI. The handler accepts either a `prompt` string or a `messages` array following the Chat Completions format. Optional fields include:

- `purpose`: set to `"coding"` to target the `gpt-5-codex` model optimized for agentic coding workflows; defaults to conversational `gpt-5` when omitted.
- `model`: overrides the automatic selection if you want full control.
- `temperature`: defaults to `0.2` for coding prompts and `0.7` for general chat, but any numeric value can be supplied.
- Any other parameters supported by the OpenAI Chat Completions API (e.g., `max_tokens`, `response_format`).

Example request payload:

```json
{
  "purpose": "coding",
  "prompt": "Write a Python function that returns the factorial of n",
  "max_tokens": 512
}
```

Requests must include an `X-GPT-Proxy-Token` header whose value matches the `GPT_PROXY_TOKEN` secret; requests missing or presenting the wrong token are rejected before reaching OpenAI. Browsers will only receive a permissive CORS header when their `Origin` appears in `GPT_ALLOWED_ORIGINS`, and requests from other origins are denied with `403 Forbidden`, ensuring non-whitelisted sites cannot piggyback on the proxy.

Responses are returned verbatim from OpenAI's `/v1/chat/completions` endpoint. Be sure to configure both `OPENAI_API_KEY` and `GPT_PROXY_TOKEN`, and update `GPT_ALLOWED_ORIGINS` in each environment before deploying.

Example `fetch` call from the frontend:

```js
await fetch("/api/gpt", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-gpt-proxy-token": "<your-matched-secret>",
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

### Cloudflare API credentials

GitHub Actions needs a scoped Cloudflare API token to run the `Deploy to Cloudflare` workflow end-to-end. Create the token from the [Cloudflare dashboard](https://dash.cloudflare.com/profile/api-tokens) with the following permissions:

- **Account** → **Cloudflare Workers** → *Edit*
- **Account** → **Cloudflare Pages** → *Edit*
- **Zone** → **DNS** → *Edit* (limit the zone scope to `goldshore.org`)

After generating the token, add or update these repository secrets under **Settings → Secrets and variables → Actions**:

| Secret name | Value | Notes |
| --- | --- | --- |
| `CF_API_TOKEN` | Newly generated API token | Required for Workers, Pages, and DNS automation |
| `CF_ACCOUNT_ID` | Account ID from the Cloudflare dashboard | Visible in **Workers & Pages → Overview** |
| `CF_ZONE_ID` | Zone identifier for `goldshore.org` | Available in the zone’s **Overview** tab |
| `CF_DNS_TARGET_PRODUCTION` | DNS content for `api.goldshore.org` | Use the worker router hostname or origin IP |
| `CF_DNS_TARGET_PREVIEW` | DNS content for `api-preview.goldshore.org` | Typically the preview worker hostname |
| `CF_DNS_TARGET_DEV` | DNS content for `api-dev.goldshore.org` | Typically the development worker hostname |

With the secrets in place you can rerun **Actions → Deploy to Cloudflare → Run workflow**, selecting the desired environment. Wrangler will deploy the worker, publish the Pages artifact, and upsert DNS records without exiting early when all secrets are populated.

## Swiss-Army Critique Pipeline

The `critique-worker/` folder contains a Cloudflare Workers + Queues + R2 pipeline that turns inbound email into automated website, portfolio, or social critiques. High-level flow:

1. Postmark (or another inbound email provider) forwards messages sent to `critiques@goldshore.org` to the ingress Worker (`src/ingress.js`).
2. The Worker normalizes the request, verifies the signature, and enqueues it on `critique-queue`.
3. The queue consumer (`src/consumer.js`) performs the requested checks (PageSpeed Insights, Cloudflare headers, portfolio CSV parsing stubs, social heuristics), saves a Markdown report to R2, and emails a response with the download link.

To deploy it, follow the step-by-step instructions in `critique-worker/README.md`, provisioning the KV namespace, R2 bucket, and queue bindings listed in `critique-worker/wrangler.toml`.

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