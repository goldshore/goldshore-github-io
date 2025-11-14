# GoldShore Codex Token & Access Verification Checklist

Use this checklist to confirm Codex (or any automation agent) has the required tokens, API keys, and permissions before executing deployments or GitHub/Cloudflare automations.

## 1. GitHub Authentication

| Secret / Variable | How to Check | Expected Result |
| --- | --- | --- |
| `GH_TOKEN` | `gh auth status` or `gh api user` | Authenticated GitHub user with `repo`, `workflow`, `issues`, `pull_requests` scopes. |
| `POLICY_APPLY_TOKEN` (optional) | `echo $POLICY_APPLY_TOKEN` | Token present with `admin:repo_hook` + `workflow` scopes. |
| Repo Permissions | `gh api repos/goldshore/goldshore/collaborators/$(gh api user --jq .login)` | Response includes `"admin"` or `"write"`. |

**Codex test**

```bash
gh api repos/goldshore/goldshore --jq '.permissions.admin'
```

Output should be `true`.

## 2. Cloudflare Credentials

| Env Var | Verification Command | Expected Result |
| --- | --- | --- |
| `CF_API_TOKEN` | `curl -s -H "Authorization: Bearer $CF_API_TOKEN" https://api.cloudflare.com/client/v4/user/tokens/verify | jq .result.status` | Returns `"active"`. |
| `CF_ACCOUNT_ID` | `echo $CF_ACCOUNT_ID` | Not empty and matches Cloudflare account. |
| `CF_ZONE_ID` | `curl -s -H "Authorization: Bearer $CF_API_TOKEN" "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID" | jq .success` | Returns `true`. |
| Wrangler login | `wrangler whoami` | Displays correct account ID and user email. |

**Codex test**

```bash
if ! wrangler whoami >/dev/null 2>&1; then
  echo "❌ Wrangler not logged in"; exit 1;
else
  echo "✅ Wrangler logged in";
fi
```

## 3. OpenAI / ChatGPT / Codex Access

| Env Var | Verification Command | Expected Result |
| --- | --- | --- |
| `OPENAI_API_KEY` | `curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"` | HTTP 200 with model list. |
| `OPENAI_ORG_ID` (if used) | `curl https://api.openai.com/v1/organizations -H "Authorization: Bearer $OPENAI_API_KEY"` | HTTP 200 with organization info. |
| Limiter Config | `npm run validate:codex-config` | Config passes validation (budgets + actions wired correctly). |

## 4. Cloudflare Worker & Pages Bindings

Ensure each binding resolves:

```bash
wrangler kv:namespace list | grep KV_SESSIONS
wrangler d1 list | grep goldshore-core
wrangler r2 bucket list | grep goldshore-public
wrangler queues list | grep goldshore-events
```

Each command should locate the expected resource IDs. Create missing resources using the bootstrap scripts.

## 5. GitHub Environment Protection & Secrets

| Check | How | Expected |
| --- | --- | --- |
| Production environment exists | `gh api repos/goldshore/goldshore/environments` | Response contains `production`. |
| Environment secrets attached | `gh api repos/goldshore/goldshore/environments/production/secrets` | Includes `CLOUDFLARE_API_TOKEN`, `CF_ACCOUNT_ID`, `ACCESS_AUD_GOLDSHORE_ADMIN`. |
| Repo secrets | `gh secret list` | Includes `GH_TOKEN`, `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `CF_ZONE_ID`, `AGENT_WEBHOOK_URL`. |

## 6. Permissions Validation Matrix

| Capability | Token / Env | Required Scopes / Rights | Check Outcome |
| --- | --- | --- | --- |
| GitHub Repo Write | `GH_TOKEN` | `repo`, `workflow`, `issues`, `pull_requests` | ✅ |
| Cloudflare Worker Deploy | `CF_API_TOKEN` | `Account.Workers Write`, `Account.R2 Read/Write`, `Account.Queues Write` | ✅ |
| DNS Management | `CF_API_TOKEN` | `Zone.DNS Edit` | ✅ |
| Pages Deploy | `CF_API_TOKEN` | `Account.Pages Write` | ✅ |
| Codex Limiter / AI Calls | `OPENAI_API_KEY` | n/a | ✅ |

## 7. Sanity Ping Tests

```bash
curl -s -H "Authorization: Bearer $CF_API_TOKEN" "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/workers/scripts" | jq '.success'

curl -s -H "Authorization: Bearer $GH_TOKEN" https://api.github.com/user | jq .login

curl -s -H "Authorization: Bearer $OPENAI_API_KEY" https://api.openai.com/v1/models | jq -r '.data[0].id'
```

All commands should return valid data, confirming access to required APIs.

## 8. Expected File Footprint

Verify the following files exist:

```
infra/
  cf/config.yaml
  cron/config.yaml
  codex/limiter.config.json
  codex/limiter.schema.json
.github/workflows/
  agent-cron.yml
  cf-deploy.yml
  codex-budget-watch.yml
```

`infra/codex/limiter.config.json` encodes the agreed budgets and the follow-up actions:

- **Core automation budget** – $250 monthly allowance with a $25 tolerance for routine triage jobs. Actions: `notifyWebhook`, `openIssue`.
- **Research burst buffer** – $325 soft ceiling with a $15 tolerance for experimentation. Action: `notifyWebhook`.
- **Hard stop monthly ceiling** – $400 cap with no tolerance. Actions: `pauseAutomation`, `openIssue`.

Actions resolve to concrete responses in the same file: posting to the automation webhook (`notifyWebhook`), filing an ops ticket in `goldshore/goldshore` (`openIssue`), or pausing costly workflows (`pauseAutomation`). The limiter script reads this config via `npx tsx infra/limits/codex_limiter.ts --config infra/codex/limiter.config.json`, so updating the JSON instantly feeds the CI budget check.

## 9. Ready / Not-Ready Summary Script

```bash
#!/usr/bin/env bash
echo "🔍 Checking GoldShore environment…"

check_var() { [ -n "${!1:-}" ] && echo "✅ $1" || echo "❌ $1 missing"; }

for v in GH_TOKEN CF_API_TOKEN CF_ACCOUNT_ID CF_ZONE_ID OPENAI_API_KEY; do
  check_var "$v"
done

wrangler whoami >/dev/null 2>&1 && echo "✅ Wrangler login" || echo "❌ Wrangler not logged in"
gh auth status >/dev/null 2>&1 && echo "✅ GitHub auth" || echo "❌ GitHub auth missing"

curl -fs https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY" >/dev/null \
  && echo "✅ OpenAI API access" || echo "❌ OpenAI API access failed"

echo "All checks complete."
```

**Result interpretation**

- All ✅ entries indicate Codex is ready for GitHub, Cloudflare, and OpenAI operations.
- Any ❌ entries should halt automation until addressed.
