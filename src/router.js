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

    const parseOriginList = (value, fallback) => {
      if (!value) {
        return fallback;
      }

      const candidates = value.split(",");
      for (const candidate of candidates) {
        const trimmed = candidate.trim();
        if (!trimmed) {
          continue;
        }

        const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
          ? trimmed
          : `https://${trimmed}`;

        try {
          const url = new URL(withScheme);
          if (url.protocol !== "http:" && url.protocol !== "https:") {
            continue;
          }

          const pathname = url.pathname.endsWith("/") && url.pathname !== "/"
            ? url.pathname.slice(0, -1)
            : url.pathname;

          return `${url.protocol}//${url.host}${pathname}`;
        } catch (error) {
          // Ignore invalid candidates and continue to the next option.
        }
      }

      return fallback;
    };

    const targetOrigin = env.ASSETS_ORIGIN
      || parseOriginList(env.PRODUCTION_ASSETS, "https://goldshore-org.pages.dev");

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
