# Cloudflare Workflows integration

Cloudflare Workflows let you orchestrate multi-step automations on Cloudflare's global network. A workflow is composed of reusable steps (workers, queues, webhooks, schedules, or third-party APIs) that can be wired together visually or defined in code. Workflows run close to your data and services, so they are well suited to coordinating Gold Shore's Worker endpoints, scheduled jobs, and post-deploy checks.

## What Workflows unlock for Gold Shore

- **Declarative automation** – Build end-to-end runbooks (for example: deploy ➝ purge cache ➝ notify analysts) without gluing together ad-hoc scripts.
- **Hybrid triggers** – Start a workflow from HTTP requests, Cron schedules, queues, or manual runs. This maps cleanly to operations we already run through GitHub Actions and Wrangler.
- **Native observability** – Each step emits logs and metrics, so you can audit runs without instrumenting custom logging.
- **Secret management** – Workflows inherit bindings and environment variables from the Workers platform, keeping credentials out of repositories.

## Example workflow blueprint

The example below shows how we could model a "Post-deploy warmup" workflow:

1. **Trigger** – `HTTP` trigger invoked by GitHub Actions after a deploy completes.
2. **Step: Call Pages origin** – Hit the `goldshore-web` Pages deployment directly to pre-warm cache for `/`, `/store`, `/repo`, and `/admin`. The legacy `api-router` Worker is deprecated and should not be invoked.
3. **Step: Queue purge** – Hit the Cloudflare Cache Purge API for stale asset paths.
4. **Step: Notification** – Send a message to Slack or email stakeholders if any step reports errors.

This design keeps infrastructure tasks in Cloudflare while GitHub Actions focuses on builds.

## Building the workflow

1. **Create a workflow**
   - Go to the [Cloudflare Workflows dashboard](https://dash.cloudflare.com/workflows) and click **Create workflow**.
   - Choose the HTTP trigger and note the generated URL. GitHub Actions can call this endpoint with a bearer token stored in repository secrets.

2. **Add steps**
  - **Warm Pages** – Use a "Fetch" step that targets the `goldshore-web` Pages domain (for example `https://goldshore.org`) and loop over the paths to warm. The retired `api-router` Worker should not be part of new workflows.
     ```json
     {
       "paths": ["/", "/store", "/repo", "/admin"]
     }
     ```
   - **Purge cache** – Add a "Fetch" step targeting `https://api.cloudflare.com/client/v4/zones/<ZONE_ID>/purge_cache` with a POST payload of `{ "files": [...] }`. Supply the API token via the built-in secrets vault.
   - **Notify** – Use the Slack or email connector to deliver status updates. Map the previous step's success state so only failures alert the team.

3. **Secure the trigger**
   - Require a bearer token and rotate it from the dashboard. Store the token in `CF_WORKFLOW_TOKEN` inside GitHub Actions secrets and Cloudflare Pages preview environments.
   - If the workflow should only run from CI, restrict the trigger by source IP or wrap it behind Access.

4. **Test and deploy**
   - Run the workflow manually from the dashboard to validate each step.
   - Update `.github/workflows/cf-deploy.yml` to `curl` the HTTP trigger as the final job step. Example shell snippet:
     ```bash
     curl -X POST "${CF_WORKFLOW_URL}" \
       -H "Authorization: Bearer ${CF_WORKFLOW_TOKEN}" \
       -H "Content-Type: application/json" \
       -d '{"deployment":"production","commit":"${GITHUB_SHA}"}'
     ```

## Operational tips

- Use workflow runs for change control logs. They show who triggered each run, inputs passed, and per-step durations.
- Store reusable fetch payloads or secrets in the workflow's environment configuration rather than inlined JSON.
- For long-running tasks (for example generating AI reports), hand off to Queues within a workflow step to maintain resilience.
- Version workflows just like code: export the JSON definition periodically (`wrangler workflows export`) and commit it to `/infra/workflows/` once the API stabilises.

Refer to Cloudflare's [Workflows documentation](https://developers.cloudflare.com/workflows/) for the evolving feature set, supported connectors, and API reference.
