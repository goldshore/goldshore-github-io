import GPTHandler from "./gpt-handler.js";

/**
 * Cloudflare Worker router that forwards traffic for goldshore properties to
 * the appropriate Cloudflare Pages deployment.
 *
 * Each Worker environment (production, preview, dev) defines an
 * `ASSETS_ORIGIN` variable in `wrangler.toml`. The Worker rewrites the incoming
 * request so it is fetched from that origin while preserving the original
 * path, query string, and method.
 */
export default {
  async fetch(request, env, ctx) {
    const incomingURL = new URL(request.url);

    if (incomingURL.pathname === "/api/gpt") {
      return GPTHandler.fetch(request, env, ctx);
    }

    const targetOrigin = env.ASSETS_ORIGIN || env.PRODUCTION_ASSETS || "https://goldshore-org.pages.dev";

    try {
      const origin = new URL(targetOrigin);
      const assetURL = new URL(request.url);

      assetURL.protocol = origin.protocol;
      assetURL.hostname = origin.hostname;
      assetURL.port = origin.port;

      if (origin.pathname && origin.pathname !== "/") {
        const basePath = origin.pathname.endsWith("/")
          ? origin.pathname.slice(0, -1)
          : origin.pathname;
        assetURL.pathname = `${basePath}${incomingURL.pathname}`;
      }

      const proxiedRequest = new Request(assetURL.toString(), request);
      const headers = new Headers(proxiedRequest.headers);
      headers.set("host", origin.hostname);

      return await fetch(new Request(proxiedRequest, { headers }), {
        cf: {
          cacheEverything: true,
        },
      });
    } catch (error) {
      return new Response("Bad Gateway", {
        status: 502,
        headers: { "content-type": "text/plain" },
      });
    }
  },
};
