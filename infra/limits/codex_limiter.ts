#!/usr/bin/env -S tsx
/**
 * Codex usage limiter helper.
 *
 * This script compares the current Codex spend against a configured budget and
 * emits a short report. Run it with `tsx`, for example:
 *
 *   pnpm tsx infra/limits/codex_limiter.ts --budget 250 --usage 175
 *   npm exec tsx infra/limits/codex_limiter.ts --usage-file usage.json --budget 500
 *
 * When executed inside CI the command will exit with a non-zero status code if
 * the budget has been exceeded. You can provide input values via CLI flags or
 * environment variables (`CODEX_BUDGET_USD`, `CODEX_USAGE_USD`, and
 * `CODEX_BUDGET_TOLERANCE_USD`).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface Report {
  label?: string;
  budget: number;
  usage: number;
  tolerance: number;
  remaining: number;
  exceeded: boolean;
}

type OutputFormat = "text" | "json";

interface CliOptions {
  label?: string;
  budget?: number;
  usage?: number;
  usageFile?: string;
  tolerance?: number;
  format: OutputFormat;
  allowPartial: boolean;
}

interface ParsedArgs {
  options: CliOptions;
  showHelp: boolean;
}

const HELP_TEXT = `Usage: tsx infra/limits/codex_limiter.ts [options]\n\n` +
  `Options:\n` +
  `  --budget <usd>           Monthly budget in USD. You can also set the\n` +
  `                           CODEX_BUDGET_USD environment variable.\n` +
  `  --usage <usd>            Current usage in USD. Alternatively provide\n` +
  `                           CODEX_USAGE_USD or --usage-file.\n` +
  `  --usage-file <path>      JSON or plain text file that contains the usage\n` +
  `                           amount. The loader will look for \'usage\',\n` +
  `                           \'usd\', or \'total.usd\' keys.\n` +
  `  --label <name>           Optional label included in the human readable\n` +
  `                           report.\n` +
  `  --tolerance <usd>        Allow the remaining budget to dip below this\n` +
  `                           threshold before reporting a failure. Defaults\n` +
  `                           to CODEX_BUDGET_TOLERANCE_USD or 0.\n` +
  `  --format <text|json>     Output format. Defaults to text.\n` +
  `  --allow-partial          Do not exit with an error when either usage or\n` +
  `                           budget is missing. This is useful when the\n` +
  `                           workflow is optional.\n` +
  `  --help                   Show this help text.\n`;

function printHelp(): void {
  console.log(HELP_TEXT);
}

function parseNumber(value: string, flag: string): number {
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Expected a numeric value for ${flag}, received: ${value}`);
  }

  return parsed;
}

function parseArgs(argv: string[]): ParsedArgs {
  const options: CliOptions = {
    format: "text",
    allowPartial: false,
  };
  let showHelp = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--help":
      case "-h":
        showHelp = true;
        break;
      case "--budget": {
        const value = argv[++i];
        options.budget = parseNumber(value, "--budget");
        break;
      }
      case "--usage": {
        const value = argv[++i];
        options.usage = parseNumber(value, "--usage");
        break;
      }
      case "--usage-file": {
        options.usageFile = argv[++i];
        if (!options.usageFile) {
          throw new Error("--usage-file requires a path argument");
        }
        break;
      }
      case "--label": {
        options.label = argv[++i];
        if (!options.label) {
          throw new Error("--label requires a name argument");
        }
        break;
      }
      case "--tolerance": {
        const value = argv[++i];
        options.tolerance = parseNumber(value, "--tolerance");
        break;
      }
      case "--format": {
        const value = argv[++i];
        if (value !== "text" && value !== "json") {
          throw new Error(`Unsupported format: ${value}`);
        }
        options.format = value;
        break;
      }
      case "--allow-partial":
        options.allowPartial = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { options, showHelp };
}

function readNumberFromEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw || raw.trim() === "") {
    return undefined;
  }

  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be numeric. Received: ${raw}`);
  }

  return parsed;
}

function loadUsageFromFile(filePath: string): number {
  const resolved = resolve(process.cwd(), filePath);
  const rawContent = readFileSync(resolved, "utf8").trim();
  if (rawContent === "") {
    throw new Error(`Usage file ${filePath} is empty.`);
  }

  if (!rawContent.startsWith("{") && !rawContent.startsWith("[")) {
    const direct = Number(rawContent);
    if (!Number.isNaN(direct)) {
      return direct;
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch (error) {
    throw new Error(`Unable to parse usage file ${filePath}: ${(error as Error).message}`);
  }

  const candidates: Array<unknown> = [];
  candidates.push(parsed);

  if (parsed && typeof parsed === "object") {
    const data = parsed as Record<string, unknown>;

    if ("usage" in data) {
      candidates.push(data.usage);
    }

    if ("usd" in data) {
      candidates.push(data.usd);
    }

    if ("total" in data && data.total && typeof data.total === "object") {
      const total = data.total as Record<string, unknown>;
      if ("usd" in total) {
        candidates.push(total.usd);
      }
    }
  }

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
    if (typeof candidate === "string" && candidate.trim() !== "") {
      const value = Number(candidate);
      if (!Number.isNaN(value)) {
        return value;
      }
    }
  }

  throw new Error(`Could not determine usage from ${filePath}.`);
}

function buildReport(options: CliOptions): Report {
  let budget = options.budget;
  if (budget === undefined) {
    budget = readNumberFromEnv("CODEX_BUDGET_USD");
  }

  let usage = options.usage;
  if (usage === undefined && options.usageFile) {
    usage = loadUsageFromFile(options.usageFile);
  }
  if (usage === undefined) {
    usage = readNumberFromEnv("CODEX_USAGE_USD");
  }

  let tolerance = options.tolerance;
  if (tolerance === undefined) {
    tolerance = readNumberFromEnv("CODEX_BUDGET_TOLERANCE_USD") ?? 0;
  }

  if (budget === undefined || usage === undefined) {
    const missing: string[] = [];
    if (budget === undefined) missing.push("budget");
    if (usage === undefined) missing.push("usage");

    const message = `Missing required ${missing.join(" and ")} value(s). Provide them via ` +
      "command-line flags or environment variables.";

    if (options.allowPartial) {
      return {
        label: options.label,
        budget: budget ?? 0,
        usage: usage ?? 0,
        tolerance,
        remaining: Number.NaN,
        exceeded: false,
      };
    }

    throw new Error(message);
  }

  const remaining = budget - usage;
  const exceeded = remaining < -Math.abs(tolerance);

  return {
    label: options.label,
    budget,
    usage,
    tolerance,
    remaining,
    exceeded,
  };
}

function renderReport(report: Report, format: OutputFormat): string {
  if (format === "json") {
    return JSON.stringify(report, null, 2);
  }

  const labelPrefix = report.label ? `${report.label}: ` : "";
  const budgetText = report.budget.toFixed(2);
  const usageText = report.usage.toFixed(2);

  if (Number.isNaN(report.remaining)) {
    return `${labelPrefix}Codex budget check skipped (missing inputs).`;
  }

  const remainingText = report.remaining.toFixed(2);
  const status = report.exceeded ? "Budget exceeded" : "Budget OK";

  return `${labelPrefix}${status}. Usage ${usageText} / ${budgetText} USD (remaining ${remainingText}).`;
}

async function main(): Promise<void> {
  const { options, showHelp } = parseArgs(process.argv.slice(2));

  if (showHelp) {
    printHelp();
    return;
  }

  const report = buildReport(options);
  const output = renderReport(report, options.format);
  console.log(output);

  if (!Number.isNaN(report.remaining) && report.exceeded) {
    process.exitCode = 2;
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
