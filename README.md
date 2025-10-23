# GoldShore Monorepo

This repository powers the GoldShore marketing site, Cloudflare Worker router, and maintenance scripts. The project ships as a static Astro site served behind a Cloudflare Worker that protects the production domain while keeping preview deployments inexpensive.

## Project layout

- `apps/web` – Astro front-end for the marketing site and supporting pages.
- `apps/api-router` – Cloudflare Worker that routes traffic to the appropriate Pages origin and stamps cache/Access headers.
- `packages/` – Shared tooling (image processing, AI maintenance helpers, etc.).
- `infra/` – Shell scripts for DNS automation and Access provisioning.
- `docs/` – Deployment playbooks and additional reference material.

Install dependencies with `npm install` and run `npm run dev` to start the Astro site locally. The `npm run build` and `npm run process-images` scripts mirror the CI pipeline.

## GPT handler endpoint

The Cloudflare Worker now exposes a protected `POST /api/gpt` endpoint that relays chat-completion requests to OpenAI. All callers **must**:

- Include an `Authorization: Bearer <token>` header that matches the shared secret stored in the Worker as `GPT_SHARED_SECRET`.
- Send requests from an origin listed in the comma-separated `GPT_ALLOWED_ORIGINS` variable. Requests with an unrecognised `Origin` header are rejected before reaching OpenAI.

Worker secrets are configured with `wrangler secret put` (run once per environment):

```bash
wrangler secret put OPENAI_API_KEY
wrangler secret put GPT_SHARED_SECRET
wrangler secret put GPT_ALLOWED_ORIGINS
```
### Configuring OpenAI credentials
## Cloudflare Worker deployment

The Worker settings live in [`wrangler.toml`](wrangler.toml). The repository assumes a dedicated Cloudflare API token named **“Goldshore Worker”** that has the following permissions:

- Account → Workers Scripts (Edit)
- Account → Workers Routes (Edit)
- Account → Worker KV Storage (Edit)
- Account → Queues (Edit) if you operate the critique pipeline
- Account → R2 Storage (Edit) when reports are stored in R2
- Account → Pages (Read) so the Worker can discover origin hostnames

Create the token in the Cloudflare dashboard and save it locally as `CF_API_TOKEN`:

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

```bash
curl -X POST "https://goldshore.org/api/gpt" \
  -H "Origin: https://app.goldshore.org" \
  -H "Authorization: Bearer $GPT_SHARED_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "messages": [
          { "role": "user", "content": "Write a Python function that reverses a string." }
        ]
      }'
```

Successful responses return the JSON payload from the OpenAI Chat Completions API. Errors include an explanatory `error` string in the response body.
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
```bash
# One time per machine
wrangler login # optional if you prefer OAuth
wrangler secret put CF_API_TOKEN --env production
wrangler secret put CF_API_TOKEN --env preview
wrangler secret put CF_API_TOKEN --env dev
```

For automated workflows (CI, scripts in `infra/`), export the same value or add it to your `.dev.vars` file:

```bash
cat >> .dev.vars <<'ENV'
CF_API_TOKEN="goldshore"
ENV
```

### Environment-specific settings

- **Production (`wrangler deploy --env production`)** – Routes `goldshore.org/*` and `www.goldshore.org/*` to the production Pages origin defined in `ASSETS_ORIGIN`.
- **Preview (`wrangler deploy --env preview`)** – Provides Workers.dev previews and optional routed staging domains while pointing at `https://goldshore-org-preview.pages.dev`.
- **Dev (`wrangler deploy --env dev`)** – Restricts routing to `dev.goldshore.org/*` for experimental branches.

Each environment shares the `APP_NAME`, origin mappings, and Turnstile/OpenAI secrets. Update [`wrangler.toml`](wrangler.toml) when origin hostnames change and redeploy with the appropriate `wrangler deploy` command.

## Related documentation

- [`docs/cloudflare-deployment.md`](docs/cloudflare-deployment.md) – Checklist for keeping Pages and the Worker in sync.
- [`GOLDSHORE_IMPLEMENTATION_GUIDE.md`](GOLDSHORE_IMPLEMENTATION_GUIDE.md) – Deep dive into layout, automation, and DNS practices.
