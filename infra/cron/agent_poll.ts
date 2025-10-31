#!/usr/bin/env -S node --experimental-fetch
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { commentOnPR, createFixBranchAndPR, findOpenConflicts, openOpsIssue } from "./helpers/github";
import {
  fetchWorkerRoute,
  getDNSRecords,
  getPagesProjectBuildStatus,
  getWorkerBindings
} from "./helpers/cloudflare";


type PagesRule = { repo: string; path: string };

type DNSRequirement = { name: string; type: string; contains?: string };

type PagesCheck = { type: "pages_build_status"; project: string };

type WorkerCheck = {
  type: "worker_health";
  script: string;
  path: string;
  domain_override?: string;
};

type DNSCheck = { type: "dns_records"; required: DNSRequirement[] };

type CloudflareCheck = PagesCheck | WorkerCheck | DNSCheck;

function loadConfig() {
  const pJson = path.join(process.cwd(), "infra/cron/config.json");
  const pYaml = path.join(process.cwd(), "infra/cron/config.yaml");
  if (fs.existsSync(pJson)) return JSON.parse(fs.readFileSync(pJson, "utf8"));
  if (fs.existsSync(pYaml)) return YAML.parse(fs.readFileSync(pYaml, "utf8"));
  throw new Error("Missing infra/cron/config.(json|yaml)");
}

const cfg: any = loadConfig();
const org: string = cfg.github.org;

function log(...a: unknown[]) {
  console.log("[agent]", ...a);
}

function truncate(text: string, limit = 500) {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}…`;
}

function formatBodyPreview(body: string) {
  if (!body) return "\n\n_No response body_";
  return `\n\n\`\`\`\n${truncate(body, 800)}\n\`\`\``;
}

async function getWorkerBindingsWarning(script: string) {
  try {
    const bindings = await getWorkerBindings(script);
    if (!Array.isArray(bindings) || bindings.length === 0) {
      return "Cloudflare API returned no bindings for this Worker. Verify wrangler configuration and deployment.";
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `Unable to load Worker bindings: ${message}`;
  }
  return null;
}

async function openWorkerHealthIncident(script: string, routePath: string, detail: string) {
  let body = detail;
  const bindingsWarning = await getWorkerBindingsWarning(script);
  if (bindingsWarning) {
    body += `\n\nBindings warning: ${bindingsWarning}`;
  }
  log("Worker health incident", script, detail);
  await openOpsIssue(
    org,
    "goldshore",
    `Worker health check failed: ${script}`,
    `Check path: \`${routePath}\`\n\n${body}`,
    cfg.ai_agent.triage_labels
  );
}

async function ensurePagesOutputDirRule() {
  const rules: PagesRule[] = cfg.rules?.pages_output_dirs ?? [];
  for (const rule of rules) {
    const { repo, path: out } = rule;
    const pkgRes = await fetch(`https://api.github.com/repos/${org}/${repo}/contents/package.json`, {
      headers: { Authorization: `Bearer ${process.env.GH_TOKEN}` }
    })
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null);
    if (!pkgRes || Array.isArray(pkgRes)) continue;
    const pkg = JSON.parse(Buffer.from(pkgRes.content, "base64").toString("utf8"));
    const build = pkg.scripts?.build ?? "";
    if (!build.includes(out)) {
      const title = `fix(pages): ensure build outputs to ${out}`;
      const body = `Automated fix: ensure Cloudflare Pages output path is **${out}**.`;
      const dirParts = out.split("/");
      const parentDir = dirParts.slice(0, -1).join("/");
      const script = `${build ? `${build} && ` : ""}mkdir -p ${parentDir} && rm -rf ${out} && cp -r dist ${out}`;
      const changes = [
        {
          path: "package.json",
          content: JSON.stringify(
            {
              ...pkg,
              scripts: {
                ...pkg.scripts,
                build: script
              }
            },
            null,
            2
          )
        }
      ];
      const pr = await createFixBranchAndPR(
        org,
        repo,
        "main",
        `chore/agent-fix-pages-output-${repo}`,
        title,
        body,
        changes
      );
      log("Opened PR", repo, pr.html_url);
    }
  }
}

async function checkCloudflare() {
  const checks: CloudflareCheck[] = cfg.cloudflare.checks || [];
  for (const check of checks) {
    if (check.type === "pages_build_status") {
      const status = await getPagesProjectBuildStatus(check.project);
      if (!["success", "completed"].includes(status)) {
        await openOpsIssue(
          org,
          "goldshore",
          `Pages build issue: ${check.project}`,
          `Latest build stage status: \`${status}\`. Investigate CF Pages logs and retry build.`,
          cfg.ai_agent.triage_labels
        );
      }
    }
    if (check.type === "dns_records") {
      const dns = await getDNSRecords();
      for (const req of check.required) {
        const hit = dns.find(
          (d: any) =>
            d.name === req.name &&
            d.type === req.type &&
            (req.contains ? d.content?.includes(req.contains) : true)
        );
        if (!hit) {
          await openOpsIssue(
            org,
            "goldshore",
            `DNS missing/invalid: ${req.name} (${req.type})`,
            `Record is missing or does not match constraints. Required: \`${JSON.stringify(req)}\``,
            cfg.ai_agent.triage_labels
          );
        }
      }
    }
    if (check.type === "worker_health") {
      try {
        const { response, url } = await fetchWorkerRoute(check.script, check.path);
        const bodyText = await response.text();
        if (!response.ok) {
          await openWorkerHealthIncident(
            check.script,
            check.path,
            `Health endpoint \`${url}\` returned HTTP ${response.status}.${formatBodyPreview(bodyText)}`
          );
          continue;
        }
        if (!bodyText) {
          await openWorkerHealthIncident(
            check.script,
            check.path,
            `Health endpoint \`${url}\` returned an empty body. Expected JSON payload with \`{ ok: true }\`.`
          );
          continue;
        }
        let payload: unknown;
        try {
          payload = JSON.parse(bodyText);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await openWorkerHealthIncident(
            check.script,
            check.path,
            `Health endpoint \`${url}\` returned invalid JSON (${message}).${formatBodyPreview(bodyText)}`
          );
          continue;
        }
        if (!payload || typeof payload !== "object") {
          await openWorkerHealthIncident(
            check.script,
            check.path,
            `Health endpoint \`${url}\` returned a non-object payload.${formatBodyPreview(bodyText)}`
          );
          continue;
        }
        type WorkerHealthPayload = {
          ok?: unknown;
          failures?: unknown;
          errors?: unknown;
        } & Record<string, unknown>;
        const health = payload as WorkerHealthPayload;
        if (health.ok !== true) {
          await openWorkerHealthIncident(
            check.script,
            check.path,
            `Health endpoint \`${url}\` reported \`ok !== true\`.${formatBodyPreview(bodyText)}`
          );
          continue;
        }
        const normalizeMessages = (items: unknown[]): string[] =>
          items
            .map(item => {
              if (typeof item === "string") return item;
              if (item && typeof item === "object") {
                const maybeMessage = (item as Record<string, unknown>).message;
                if (typeof maybeMessage === "string") return maybeMessage;
                try {
                  return JSON.stringify(item);
                } catch {
                  return String(item);
                }
              }
              return String(item);
            })
            .filter((msg): msg is string => Boolean(msg));
        const failures = Array.isArray(health.failures) ? normalizeMessages(health.failures) : [];
        if (failures.length > 0) {
          await openWorkerHealthIncident(
            check.script,
            check.path,
            `Health endpoint \`${url}\` reported failures:\n- ${failures.join("\n- ")}.${formatBodyPreview(bodyText)}`
          );
          continue;
        }
        const errors = Array.isArray(health.errors) ? normalizeMessages(health.errors) : [];
        if (errors.length > 0) {
          await openWorkerHealthIncident(
            check.script,
            check.path,
            `Health endpoint \`${url}\` reported additional errors despite \`ok: true\`:\n- ${errors.join("\n- ")}.${formatBodyPreview(bodyText)}`
          );
          continue;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await openWorkerHealthIncident(
          check.script,
          check.path,
          `Failed to reach Worker health endpoint. Error: ${message}`
        );
      }
    }
  }
}

async function scanGitConflicts() {
  const repos: string[] = cfg.github.repos || [];
  for (const repo of repos) {
    const conflicts = await findOpenConflicts(org, repo);
    for (const pr of conflicts) {
      if (cfg.rules?.open_conflicts?.open_pr_comment) {
        await commentOnPR(
          org,
          repo,
          pr.number,
          "Automated notice: this PR is in a conflicted state (`mergeable_state=dirty`). " +
            "Fix: `git fetch origin && git rebase origin/main`, resolve, then `git push --force-with-lease`."
        );
      }
    }
  }
}

(async function main() {
  await checkCloudflare();
  await ensurePagesOutputDirRule();
  await scanGitConflicts();
  log("Agent poll completed.");
})().catch(err => {
  console.error(err);
  process.exit(1);
});
