/// <reference types="@cloudflare/workers-types" />

import { describe, it, expect, vi, afterEach } from "vitest";

import worker, { type Env } from "./index";
import * as webhookModule from "./webhook";

const encoder = new TextEncoder();

async function hmacSha256Hex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("routeRequest", () => {
  it("forwards signed GitHub webhook requests to handleWebhook", async () => {
    const secret = "test-secret";
    const env = {
      GITHUB_WEBHOOK_SECRET: secret,
      GITHUB_APP_ID: "123456",
      GITHUB_APP_PRIVATE_KEY: "dummy-key",
      GOLDSHORE_ENV: "test",
      GOLDSHORE_JWT_SECRET: "jwt-secret",
      KV_SESSIONS: {} as unknown as KVNamespace,
      KV_CACHE: {} as unknown as KVNamespace,
      DO_SESSIONS: {} as unknown as DurableObjectNamespace,
      Q_EVENTS: { send: vi.fn() } as unknown as Queue<unknown>,
      RATE_LIMIT_MAX: "10",
      RATE_LIMIT_WINDOW: "60"
    } as unknown as Env;

    const payload = JSON.stringify({ ref: "refs/heads/main" });
    const signature = await hmacSha256Hex(secret, payload);
    const request = new Request("https://example.com/github/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": "push",
        "x-hub-signature-256": `sha256=${signature}`
      },
      body: payload
    });

    const ctx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn()
    } as unknown as ExecutionContext;

    const handleWebhookSpy = vi.spyOn(webhookModule, "handleWebhook");

    const response = await worker.fetch(request, env, ctx);

    expect(handleWebhookSpy).toHaveBeenCalledTimes(1);
    expect(handleWebhookSpy).toHaveBeenCalledWith(request, env, ctx);
    expect(response.status).toBe(202);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
