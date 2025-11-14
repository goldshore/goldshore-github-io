process.env.CF_API_TOKEN = process.env.CF_API_TOKEN ?? "test-token";
process.env.CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID ?? "test-account";
process.env.CF_ZONE_ID = process.env.CF_ZONE_ID ?? "test-zone";

import assert from "node:assert/strict";
import test from "node:test";

test("fetchWorkerRoute respects domain override host and path", async () => {
  const { fetchWorkerRoute } = await import("./cloudflare");
  const originalFetch = global.fetch;
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    if (calls.length === 1) {
      const expectedURL = `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/workers/scripts/my-worker/routes`;
      assert.equal(String(input), expectedURL);
      return new Response(
        JSON.stringify({ result: [{ pattern: "example.com/api/*" }] }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const { url, response } = await fetchWorkerRoute(
      "my-worker",
      "/health",
      undefined,
      "override.example.net"
    );
    assert.equal(url, "https://override.example.net/api/health");
    assert.equal(calls.length, 2);

    const routeCall = calls[1]!;
    assert.equal(String(routeCall.input), "https://override.example.net/api/health");
    const headers = routeCall.init?.headers as Record<string, string>;
    assert(headers, "Expected headers to be provided for override call");
    assert.equal(headers["host"], "override.example.net");
    assert.equal(headers["user-agent"], "goldshore-agent/worker-health-check");

    assert.equal(response.status, 200);
  } finally {
    global.fetch = originalFetch;
  }
});
