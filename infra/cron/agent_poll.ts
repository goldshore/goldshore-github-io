#!/usr/bin/env -S node --experimental-fetch
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { commentOnPR, createFixBranchAndPR, findOpenConflicts, openOpsIssue } from "./helpers/github";
import { getDNSRecords, getPagesProjectBuildStatus, getWorkerBindings } from "./helpers/cloudflare";


type PagesRule = { repo: string; path: string };

type DNSRequirement = { name: string; type: string; contains?: string };

type PagesCheck = { type: "pages_build_status"; project: string };

type WorkerCheck = { type: "worker_health"; script: string; path: string };

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
const dryRunFlag = String(process.env.DRY_RUN ?? "").toLowerCase();
const isDryRun = dryRunFlag === "1" || dryRunFlag === "true" || dryRunFlag === "yes";

function log(...a: unknown[]) {
  console.log("[agent]", ...a);
}

async function ensurePagesOutputDirRule() {
  const rules: PagesRule[] = cfg.rules?.pages_output_dirs ?? [];
  for (const rule of rules) {
    const { repo, path: out } = rule;
    if (isDryRun) {
      log(`[dry-run] would validate Pages output dir for ${repo} -> ${out}`);
      continue;
    }
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
  if (isDryRun) {
    log("[dry-run] skipping Cloudflare checks");
    return;
  }
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
      const bindings = await getWorkerBindings(check.script);
      if (!Array.isArray(bindings) || bindings.length === 0) {
        await openOpsIssue(
          org,
          "goldshore",
          `Worker missing bindings: ${check.script}`,
          `No bindings returned for Worker \`${check.script}\`. Verify wrangler.toml and deployment.`,
          cfg.ai_agent.triage_labels
        );
      }
    }
  }
}

async function scanGitConflicts() {
  if (isDryRun) {
    log("[dry-run] skipping conflict scan");
    return;
  }
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
  if (isDryRun) {
    log("Running in dry-run mode; no external requests will be made.");
  }
  await checkCloudflare();
  await ensurePagesOutputDirRule();
  await scanGitConflicts();
  log("Agent poll completed.");
})().catch(err => {
  console.error(err);
  process.exit(1);
});
