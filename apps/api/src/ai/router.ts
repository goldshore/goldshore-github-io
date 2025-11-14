import modelsConfig from "../../../../infra/codex/ai.models.json";
import toolsConfig from "../../../../infra/codex/ai.tools.json";
import guardrailsConfig from "../../../../infra/codex/ai.guardrails.json";
import type { AccessGrant } from "../auth/access";
import { getAdapter } from "./providers";
import type { ToolDefinition } from "./providers/types";

interface ProviderModelMetadata {
  capabilities?: string[];
  cost?: number;
  speed?: string;
}

interface ProviderConfig {
  base_url?: string;
  models: Record<string, ProviderModelMetadata>;
  env?: {
    api_key?: string;
  };
}

interface PolicyRule {
  when?: {
    task?: AIRequest["task"][];
    max_cost?: number;
    latency?: string;
  };
  route?: string;
  fallback?: string;
}

interface ModelsConfig {
  default_policy: string;
  providers: Record<string, ProviderConfig>;
  policies: Record<string, PolicyRule[]>;
}

interface ToolsConfig {
  version: string;
  tools: ToolDefinition[];
  guardrails?: Record<string, unknown>;
}

interface GuardrailsConfig {
  budgets?: {
    default_usd_per_day?: number;
    admin_usd_per_day?: number;
  };
  caps?: {
    max_tokens_per_request?: number;
    max_concurrent_requests?: number;
  };
  pii_redaction?: Record<string, unknown>;
  logging?: Record<string, unknown>;
}

export type AIRequest = {
  task: "general" | "qa" | "analysis" | "plan" | "summarize" | "draft";
  input: string;
  tool_choice?: "auto" | "none";
  policy?: string;
  user?: string;
  metadata?: Record<string, string>;
};

const models = modelsConfig as ModelsConfig;
const tools = toolsConfig as ToolsConfig;
const guardrails = guardrailsConfig as GuardrailsConfig;

export async function routeAI(request: AIRequest, env: Record<string, unknown>, grant?: AccessGrant): Promise<Response> {
  const policyName = request.policy || models.default_policy;
  const policy = models.policies[policyName];
  if (!policy) {
    throw new Error(`Unknown AI policy: ${policyName}`);
  }

  const candidate = pickRoute(policy, request);
  const [provider, model] = candidate.split(":");
  if (!provider || !model) {
    throw new Error(`Invalid route candidate: ${candidate}`);
  }
  const providerConfig = models.providers[provider];
  if (!providerConfig) {
    throw new Error(`Missing provider configuration for ${provider}`);
  }
  if (!providerConfig.models[model]) {
    throw new Error(`Missing model configuration for ${provider}:${model}`);
  }

  const budgetOk = checkBudget(request, provider, model, grant);
  if (!budgetOk) {
    return new Response(JSON.stringify({ ok: false, error: "BUDGET_EXCEEDED" }), {
      status: 429,
      headers: { "content-type": "application/json" }
    });
  }

  const adapter = getAdapter(provider);
  const keyName = providerConfig.env?.api_key;
  const apiKey = keyName ? (env[keyName] as string | undefined) : undefined;
  if (keyName && !apiKey) {
    throw new Error(`Missing API key for provider ${provider}`);
  }

  const toolset = request.tool_choice === "none" ? [] : tools.tools ?? [];
  return adapter.generate({
    model,
    apiKey,
    input: request.input,
    baseUrl: providerConfig.base_url,
    tools: toolset,
    stream: true
  });
}

function pickRoute(policy: PolicyRule[], request: AIRequest): string {
  let fallback: string | undefined;
  for (const rule of policy) {
    if (rule.fallback) {
      fallback = rule.fallback;
      continue;
    }
    if (!rule.route) continue;
    if (!rule.when) {
      return rule.route;
    }
    const { task, max_cost } = rule.when;
    if (task && !task.includes(request.task)) {
      continue;
    }
    if (max_cost !== undefined) {
      const routeCost = getModelCost(rule.route);
      if (routeCost !== undefined && routeCost > max_cost) {
        continue;
      }
    }
    return rule.route;
  }
  if (fallback) {
    return fallback;
  }
  throw new Error(`No matching AI policy route for ${request.task}`);
}

function getModelCost(route: string): number | undefined {
  const [provider, model] = route.split(":");
  const providerConfig = provider ? models.providers[provider] : undefined;
  const modelConfig = providerConfig?.models?.[model ?? ""];
  return modelConfig?.cost;
}

function checkBudget(request: AIRequest, provider: string, model: string, grant?: AccessGrant): boolean {
  const cost = getModelCost(`${provider}:${model}`) ?? 0;
  const isAdmin = grant?.scopes?.some(scope => scope.toLowerCase() === "admin") ?? false;
  const limit = isAdmin ? guardrails.budgets?.admin_usd_per_day : guardrails.budgets?.default_usd_per_day;
  if (limit !== undefined && cost > limit) {
    return false;
  }
  const requestedTokens = request.metadata?.tokens ? Number(request.metadata.tokens) : undefined;
  if (requestedTokens && guardrails.caps?.max_tokens_per_request && requestedTokens > guardrails.caps.max_tokens_per_request) {
    return false;
  }
  return true;
}
