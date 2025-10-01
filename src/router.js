const normalizeOrigin = (rawOrigin, defaultProtocol) => {
  if (!rawOrigin) return null;

  const protocol = defaultProtocol
    ? defaultProtocol.endsWith(':')
      ? defaultProtocol
      : `${defaultProtocol}:`
    : 'https:';

  try {
    return new URL(rawOrigin);
  } catch (error) {
    return new URL(`${protocol}//${rawOrigin}`);
  }
};

const buildUpstreamRequest = (request, upstreamUrl) => {
  const url = new URL(request.url);
  const target = new URL(upstreamUrl);

  target.pathname = url.pathname;
  target.search = url.search;

  return new Request(target.toString(), request);
};

const isCacheableMethod = (method = '') => {
  const normalized = String(method).toUpperCase();
  return normalized === 'GET' || normalized === 'HEAD';
};

const parseHostList = (value) => {
  if (!value) return [];

  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const environment = (env.ENVIRONMENT || 'preview').toLowerCase();

    const productionOrigin = normalizeOrigin(env.PRODUCTION_ORIGIN, env.UPSTREAM_PROTOCOL);
    const previewOrigin = normalizeOrigin(env.PREVIEW_ORIGIN, env.UPSTREAM_PROTOCOL);

    const allowedHostnames = parseHostList(env.ALLOWED_HOSTNAMES);
    const canonicalHostname = (env.CANONICAL_HOSTNAME || '').trim().toLowerCase();

    if (environment === 'production' && allowedHostnames.length > 0) {
      const requestHost = url.hostname.toLowerCase();

      if (!allowedHostnames.includes(requestHost)) {
        if (canonicalHostname) {
          const redirectTarget = new URL(request.url);
          redirectTarget.hostname = canonicalHostname;
          return Response.redirect(redirectTarget.toString(), 301);
        }

        return new Response('Forbidden host', { status: 403 });
      }
    }

    const upstreamOrigin = environment === 'production'
      ? productionOrigin
      : previewOrigin || productionOrigin;

    if (!upstreamOrigin) {
      return fetch(request);
    }

    if (url.hostname === upstreamOrigin.hostname) {
      return fetch(request);
    }

    const upstreamRequest = buildUpstreamRequest(request, upstreamOrigin);
    const fetchInit = {};
    const cacheTtl = Number(env.CACHE_TTL);

    if (isCacheableMethod(request.method)) {
      fetchInit.cf = {
        cacheEverything: true,
        cacheTtl: Number.isFinite(cacheTtl) ? cacheTtl : undefined,
      };
    }

    const response = await fetch(upstreamRequest, fetchInit);

    const outgoing = new Response(response.body, response);

    if (outgoing.headers.has('Location')) {
      const location = new URL(outgoing.headers.get('Location'), upstreamOrigin);
      location.hostname = url.hostname;
      outgoing.headers.set('Location', location.toString());
    }

    return outgoing;
  },
};
