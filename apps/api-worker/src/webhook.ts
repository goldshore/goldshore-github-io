import { corsHeaders } from "./lib/cors";
import {
  mintInstallationToken,
  type GitHubAuthEnv,
  type InstallationToken
} from "./githubAuth";

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

const textEncoder = new TextEncoder();

async function verifySignature(payload: string, signatureHeader: string | null, secret: string) {
  if (!secret) {
    throw new Error("Missing GITHUB_WEBHOOK_SECRET environment variable");
  }

  if (!signatureHeader) {
    return false;
  }

  const signaturePrefix = "sha256=";
  if (!signatureHeader.startsWith(signaturePrefix)) {
    return false;
  }

  const signatureHex = signatureHeader.slice(signaturePrefix.length);
  const signatureBytes = hexToUint8Array(signatureHex);

  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );

  const data = textEncoder.encode(payload);
  const signatureBuffer = signatureBytes.buffer.slice(
    signatureBytes.byteOffset,
    signatureBytes.byteOffset + signatureBytes.byteLength
  ) as ArrayBuffer;
  const payloadBuffer = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength
  ) as ArrayBuffer;
  return crypto.subtle.verify("HMAC", key, signatureBuffer, payloadBuffer);
}

function hexToUint8Array(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("Invalid signature length");
  }

  const array = new Uint8Array(hex.length / 2);
  for (let i = 0; i < array.length; i += 1) {
    const byte = parseInt(hex.substr(i * 2, 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error("Signature contains non-hex characters");
    }
    array[i] = byte;
  }
  return array;
}

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

  const valid = await verifySignature(payloadText, signature, env.GITHUB_WEBHOOK_SECRET);
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
