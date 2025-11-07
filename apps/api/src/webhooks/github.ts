import { loadDesiredState } from "../cloudflare/config";
import { applyCloudflareDesiredState } from "../cloudflare/apply";
import { extractRefName, GitHubWebhookError, parseGitHubWebhook } from "./dispatcher";

export interface GitHubWebhookEnv {
  GH_WEBHOOK_SECRET: string;
  GITHUB_DEFAULT_BRANCH?: string;
  CLOUDFLARE_API_TOKEN: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_ZONE_ID: string;
  CONFIG_KV?: KVNamespace;
  ENV_BUNDLE_JSON?: string;
}

const encoder = new TextEncoder();

const hexToBytes = (hex: string): Uint8Array => {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string length");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
};

const bytesToHex = (bytes: ArrayBuffer): string => {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const timingSafeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
};

const verifySignature = async (secret: string, rawBody: string, signature: string | null) => {
  if (!secret) {
    throw new GitHubWebhookError("Webhook secret not configured", 500);
  }

  if (!signature) {
    throw new GitHubWebhookError("Missing X-Hub-Signature-256 header", 401);
  }

  const [algorithm, digest] = signature.split("=");
  if (algorithm !== "sha256" || !digest) {
    throw new GitHubWebhookError("Unsupported signature format", 401);
  }

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const expected = hexToBytes(bytesToHex(mac));
  const provided = hexToBytes(digest);

  if (!timingSafeEqual(expected, provided)) {
    throw new GitHubWebhookError("Invalid webhook signature", 401);
  }
};

const shouldTriggerReconcile = (event: string, payload: any, defaultBranch: string): boolean => {
  if (event === "push") {
    const branch = extractRefName(payload);
    return branch === defaultBranch;
  }

  if (event === "workflow_run") {
    const branch = payload?.workflow_run?.head_branch;
    return branch === defaultBranch && payload?.workflow_run?.conclusion === "success";
  }

  return false;
};

const triggerCloudflareReconcile = async (env: GitHubWebhookEnv, ctx: ExecutionContext) => {
  ctx.waitUntil(
    (async () => {
      const desired = await loadDesiredState(env);
      await applyCloudflareDesiredState(env, desired);
    })()
  );
};

export const handleGitHubWebhook = async (
  req: Request,
  env: GitHubWebhookEnv,
  ctx: ExecutionContext
): Promise<Response> => {
  try {
    const parsed = await parseGitHubWebhook(req);
    await verifySignature(env.GH_WEBHOOK_SECRET, parsed.rawBody, parsed.signature);

    if (parsed.event === "ping") {
      return new Response(JSON.stringify({ ok: true, pong: parsed.id }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const defaultBranch = env.GITHUB_DEFAULT_BRANCH || "main";
    const reconcile = shouldTriggerReconcile(parsed.event, parsed.payload, defaultBranch);

    if (reconcile) {
      await triggerCloudflareReconcile(env, ctx);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        event: parsed.event,
        reconciled: reconcile,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (err) {
    if (err instanceof GitHubWebhookError) {
      return new Response(JSON.stringify({ ok: false, error: err.message }), {
        status: err.status,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: "UNEXPECTED_ERROR" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};

export const reconcileCloudflare = async (
  env: GitHubWebhookEnv
): Promise<{ ok: boolean; reconciled: true }> => {
  const desired = await loadDesiredState(env);
  await applyCloudflareDesiredState(env, desired);
  return { ok: true, reconciled: true };
};

