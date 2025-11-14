#!/usr/bin/env -S tsx
/**
 * Quick validation helper for the Codex limiter configuration.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface ConfigUsageSource {
  type: "environment" | "file" | "value";
  key?: string;
  path?: string;
  amount?: number;
}

interface ConfigActionDefinition {
  type: string;
  description?: string;
  [key: string]: unknown;
}

interface ConfiguredBudget {
  id: string;
  label: string;
  amount: number;
  tolerance?: number;
  usageSource?: string;
  actions?: string[];
}

interface LimiterConfig {
  currency: string;
  usageSources?: Record<string, ConfigUsageSource>;
  budgets: ConfiguredBudget[];
  actions?: Record<string, ConfigActionDefinition>;
}

function readConfig(pathArg?: string): LimiterConfig {
  const targetPath = resolve(process.cwd(), pathArg ?? "infra/codex/limiter.config.json");
  const raw = readFileSync(targetPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Unable to parse limiter config: ${(error as Error).message}`);
  }
  return parsed as LimiterConfig;
}

function validateConfig(config: LimiterConfig): string[] {
  const errors: string[] = [];

  if (!config || typeof config !== "object") {
    errors.push("Config must be an object.");
    return errors;
  }

  if (!config.currency || typeof config.currency !== "string") {
    errors.push("currency must be a non-empty string.");
  }

  if (!Array.isArray(config.budgets) || config.budgets.length === 0) {
    errors.push("budgets must be a non-empty array.");
  } else {
    const seenIds = new Set<string>();
    for (const [index, budget] of config.budgets.entries()) {
      if (!budget || typeof budget !== "object") {
        errors.push(`budgets[${index}] must be an object.`);
        continue;
      }
      if (!budget.id || typeof budget.id !== "string") {
        errors.push(`budgets[${index}].id must be a non-empty string.`);
      } else if (seenIds.has(budget.id)) {
        errors.push(`budgets[${index}].id duplicates ${budget.id}.`);
      } else {
        seenIds.add(budget.id);
      }
      if (!budget.label || typeof budget.label !== "string") {
        errors.push(`budgets[${index}].label must be a non-empty string.`);
      }
      if (typeof budget.amount !== "number" || Number.isNaN(budget.amount)) {
        errors.push(`budgets[${index}].amount must be a number.`);
      }
      if (budget.tolerance !== undefined && typeof budget.tolerance !== "number") {
        errors.push(`budgets[${index}].tolerance must be a number when provided.`);
      }
      if (budget.usageSource) {
        if (!config.usageSources || !config.usageSources[budget.usageSource]) {
          errors.push(`budgets[${index}].usageSource references unknown key ${budget.usageSource}.`);
        }
      }
      if (budget.actions) {
        if (!Array.isArray(budget.actions)) {
          errors.push(`budgets[${index}].actions must be an array when provided.`);
        } else {
          for (const actionId of budget.actions) {
            if (typeof actionId !== "string" || actionId.length === 0) {
              errors.push(`budgets[${index}].actions must contain string identifiers.`);
            } else if (!config.actions || !config.actions[actionId]) {
              errors.push(`budgets[${index}].actions references unknown action ${actionId}.`);
            }
          }
        }
      }
    }
  }

  if (config.usageSources) {
    for (const [key, source] of Object.entries(config.usageSources)) {
      if (!source || typeof source !== "object") {
        errors.push(`usageSources.${key} must be an object.`);
        continue;
      }
      if (source.type !== "environment" && source.type !== "file" && source.type !== "value") {
        errors.push(`usageSources.${key}.type must be one of environment|file|value.`);
        continue;
      }
      if (source.type === "environment" && (!source.key || typeof source.key !== "string")) {
        errors.push(`usageSources.${key}.key is required for environment sources.`);
      }
      if (source.type === "file" && (!source.path || typeof source.path !== "string")) {
        errors.push(`usageSources.${key}.path is required for file sources.`);
      }
      if (source.type === "value" && typeof source.amount !== "number") {
        errors.push(`usageSources.${key}.amount is required for value sources.`);
      }
    }
  }

  if (config.actions) {
    for (const [id, action] of Object.entries(config.actions)) {
      if (!action || typeof action !== "object") {
        errors.push(`actions.${id} must be an object.`);
        continue;
      }
      if (!action.type || typeof action.type !== "string") {
        errors.push(`actions.${id}.type must be a non-empty string.`);
      }
    }
  }

  return errors;
}

function main(): void {
  try {
    const config = readConfig(process.argv[2]);
    const errors = validateConfig(config);
    if (errors.length > 0) {
      console.error("❌ limiter.config.json failed validation:");
      for (const message of errors) {
        console.error(`  - ${message}`);
      }
      process.exitCode = 1;
      return;
    }

    console.log("✅ limiter.config.json looks good.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

main();
