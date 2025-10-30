import type { ExportedHandler } from '@cloudflare/workers-types';

type Env = {
  APP_NAME: string;
  PRODUCTION_ASSETS?: string;
  PREVIEW_ASSETS?: string;
  DEV_ASSETS?: string;
  CORS_ALLOWLIST?: string;
  ASSET_ALLOWED_ORIGINS?: string;
  GPT_ALLOWED_ORIGINS?: string;
};

const pickOrigin = (host: string, env: Env): string => {
  if (host.startsWith('preview.')) {
    return env.PREVIEW_ASSETS ?? 'https://goldshore-org-preview.pages.dev';
  }

  if (host.startsWith('dev.')) {
    return env.DEV_ASSETS ?? 'https://goldshore-org-dev.pages.dev';
  }

  return env.PRODUCTION_ASSETS ?? 'https://goldshore-org.pages.dev';
};

const cachePolicy = (pathname: string): string =>
  /\.(?:js|css|png|jpg|jpeg|webp|avif|svg|woff2?)$/i.test(pathname)
    ? 'public, max-age=31536000, immutable'
    : 'public, s-maxage=600, stale-while-revalidate=86400';

const parseAllowedOrigins = (env: Env): string[] =>
  (env.CORS_ALLOWLIST ?? env.ASSET_ALLOWED_ORIGINS ?? env.GPT_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

const resolveAllowedOrigin = (origin: string | null, allowlist: string[]): string | null => {
  if (!origin) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch (error) {
    return null;
  }

  for (const allowed of allowlist) {
    if (allowed === '*') {
      return parsed.origin;
    }

    try {
      const allowedUrl = new URL(allowed);
      if (allowedUrl.origin === parsed.origin) {
        return parsed.origin;
      }
    } catch (error) {
      // Ignore malformed entries in the allowlist.
    }
  }

  return null;
};

const appendVary = (headers: Headers, value: string): void => {
  const existing = headers.get('vary');
  if (!existing) {
    headers.set('vary', value);
    return;
  }

  const current = existing
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (!current.includes(value.toLowerCase())) {
    headers.set('vary', `${existing}, ${value}`);
  }
};

const applyCorsHeaders = (headers: Headers, origin: string | null, request: Request): void => {
  if (!origin) {
    headers.delete('access-control-allow-origin');
    headers.delete('access-control-allow-headers');
    headers.delete('access-control-allow-methods');
    return;
  }

  headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-methods', 'GET,HEAD,OPTIONS');
  const requestedHeaders = request.headers.get('Access-Control-Request-Headers');
  if (requestedHeaders) {
    headers.set('access-control-allow-headers', requestedHeaders);
  } else {
    headers.set('access-control-allow-headers', 'Origin,Accept,Content-Type,Authorization');
  }
  appendVary(headers, 'Origin');
};

const buildPreflightHeaders = (origin: string, request: Request): Headers => {
  const headers = new Headers();
  headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-methods', 'GET,HEAD,OPTIONS');
  headers.set('access-control-max-age', '86400');
  const requestedHeaders = request.headers.get('Access-Control-Request-Headers');
  if (requestedHeaders) {
    headers.set('access-control-allow-headers', requestedHeaders);
  } else {
    headers.set('access-control-allow-headers', 'Origin,Accept,Content-Type,Authorization');
  }
  appendVary(headers, 'Origin');
  return headers;
};

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const origin = pickOrigin(url.hostname, env);
    const upstream = new URL(request.url.replace(url.origin, origin));
    const allowlist = parseAllowedOrigins(env);
    const corsOrigin = resolveAllowedOrigin(request.headers.get('Origin'), allowlist);

    if (request.method === 'OPTIONS') {
      if (!corsOrigin) {
        return new Response(null, { status: 403 });
      }

      return new Response(null, {
        status: 204,
        headers: buildPreflightHeaders(corsOrigin, request),
      });
    }

    const init: RequestInit = {
      method: request.method,
      headers: request.headers,
      redirect: 'follow',
    };

    if (!['GET', 'HEAD'].includes(request.method)) {
      init.body = request.body;
    }

    const response = await fetch(upstream.toString(), init);
    const headers = new Headers(response.headers);
    headers.set('x-served-by', env.APP_NAME);
    headers.set('cache-control', cachePolicy(url.pathname));
    applyCorsHeaders(headers, corsOrigin, request);

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  },
} satisfies ExportedHandler<Env>;
