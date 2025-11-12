import { handleWebhook, type WebhookEnv } from "../webhook";

export async function handleGithubWebhook(
  request: Request,
  env: WebhookEnv,
  ctx: ExecutionContext
): Promise<Response> {
  return handleWebhook(request, env, ctx);
}

export async function handleGithubCallback(): Promise<Response> {
  return new Response("oauth ok", { status: 200, headers: { "content-type": "text/plain" } });
}
