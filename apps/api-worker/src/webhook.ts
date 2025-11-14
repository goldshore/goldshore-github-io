import { corsHeaders } from "./lib/cors";
import {
  mintInstallationToken,
  type GitHubAuthEnv,
  type InstallationToken
} from "./githubAuth";
import { verifyGitHubWebhook } from "./github/webhook";

export interface WebhookEnv extends GitHubAuthEnv {
  GITHUB_WEBHOOK_SECRET: string;
}

interface WebhookContext<TPayload = unknown> {
  env: WebhookEnv;
  payload: TPayload;
  event: string;
  request: Request;
  ctx: ExecutionContext;
  getInstallationToken: (installationId?: number | string) => Promise<InstallationToken>;
}

type WebhookHandler<TPayload = unknown> = (
  context: WebhookContext<TPayload>
) => Promise<Response | void> | Response | void;

function applyCors(response: Response, origin: string) {
  const headers = corsHeaders(origin);
  for (const [key, value] of Object.entries(headers)) {
    if (!response.headers.has(key)) {
      response.headers.set(key, value);
    }
  }
  return response;
}

const handlers: Record<string, WebhookHandler> = {
  push: async ({ event }) => {
    console.info(`Received GitHub ${event} webhook`);
  },
  deployment: async ({ event }) => {
    console.info(`Received GitHub ${event} webhook`);
  },
  deployment_status: async ({ event }) => {
    console.info(`Received GitHub ${event} webhook`);
  },
  pull_request: async ({ event }) => {
    console.info(`Received GitHub ${event} webhook`);
  }
};

export async function handleWebhook(
  request: Request,
  env: WebhookEnv,
  ctx: ExecutionContext
): Promise<Response> {
  const origin = request.headers.get("Origin") ?? "*";

  const respond = (body: BodyInit | null, init: ResponseInit) => {
    const headers = new Headers(init.headers);
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    return applyCors(
      new Response(body, {
        ...init,
        headers
      }),
      origin
    );
  };

  if (request.method !== "POST") {
    return respond(
      JSON.stringify({ error: "Method Not Allowed" }),
      { status: 405 }
    );
  }

  const payloadText = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  const secret = env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("Missing GITHUB_WEBHOOK_SECRET environment variable");
  }

  const valid = await verifyGitHubWebhook(payloadText, signature, secret);
  if (!valid) {
    return respond(JSON.stringify({ error: "Invalid signature" }), { status: 401 });
  }

  let payload: unknown;
  try {
    payload = payloadText.length ? JSON.parse(payloadText) : {};
  } catch (error) {
    console.error("Failed to parse webhook payload", error);
    return respond(JSON.stringify({ error: "Invalid JSON payload" }), { status: 400 });
  }

  const event = request.headers.get("x-github-event");
  if (!event) {
    return respond(JSON.stringify({ error: "Missing x-github-event header" }), { status: 400 });
  }

  const handler = handlers[event];
  if (!handler) {
    console.info(`Unhandled GitHub webhook event: ${event}`);
    return respond(JSON.stringify({ status: "ignored" }), { status: 202 });
  }

  const installationId =
    typeof payload === "object" && payload !== null && "installation" in payload
      ? // biome-ignore lint/suspicious/noExplicitAny: GitHub payload type is dynamic
        (payload as any).installation?.id
      : undefined;

  const getInstallationToken = (id?: number | string) =>
    mintInstallationToken(env, id ?? installationId);

  try {
    const result = await handler({ env, payload, event, request, ctx, getInstallationToken });
    if (result instanceof Response) {
      return applyCors(result, origin);
    }
    return respond(JSON.stringify({ status: "ok" }), { status: 202 });
  } catch (error) {
    console.error(`Error handling GitHub ${event} webhook`, error);
    return respond(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}
