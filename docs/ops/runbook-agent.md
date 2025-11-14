# Agent Runbook

Purpose: monitor CF Pages & Workers, DNS/DMARC/SPF, and PR conflicts. Auto-open issues & small fix PRs. No force-push or auto-merge.
Secrets: GH_TOKEN, CF_API_TOKEN, CF_ACCOUNT_ID, CF_ZONE_ID, AGENT_WEBHOOK_URL.
Severity: SEV-1 prod down; SEV-2 admin degraded; SEV-3 non-blocking.
Rollback: Workers → previous version; Pages → redeploy last successful build (open incident).
