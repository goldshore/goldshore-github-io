import type { ExportedHandler } from '@cloudflare/workers-types';

type Env = {
  APP_NAME: string;
  PRODUCTION_ASSETS?: string;
  PREVIEW_ASSETS?: string;
  DEV_ASSETS?: string;
  ADMIN_ASSETS?: string;
  PREVIEW_ADMIN_ASSETS?: string;
  DEV_ADMIN_ASSETS?: string;
  GPT_ALLOWED_ORIGINS?: string;
};

const pickOrigin = (host: string, env: Env): string => {
  if (host === 'admin.goldshore.org') {
    return env.ADMIN_ASSETS ?? 'https://goldshore-admin.pages.dev';
  }

  if (host.startsWith('preview.')) {
    if (host === 'preview.admin.goldshore.org') {
      return env.PREVIEW_ADMIN_ASSETS ?? 'https://goldshore-admin-preview.pages.dev';
    }

    return env.PREVIEW_ASSETS ?? 'https://goldshore-org-preview.pages.dev';
  }

  if (host.startsWith('dev.')) {
    if (host === 'dev.admin.goldshore.org') {
      return env.DEV_ADMIN_ASSETS ?? 'https://goldshore-admin-dev.pages.dev';
    }

    return env.DEV_ASSETS ?? 'https://goldshore-org-dev.pages.dev';
  }

  return env.PRODUCTION_ASSETS ?? 'https://goldshore-org.pages.dev';
};

const parseAllowedOrigins = (raw?: string): string[] => {
  if (!raw) {
    return [];
  }

  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const resolveCorsOrigin = (requestOrigin: string | null, fallbackOrigin: string, allowedOrigins: string[]): string => {
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  return fallbackOrigin;
};

const buildCorsHeaders = (requestOrigin: string | null, fallbackOrigin: string, allowedOrigins: string[]): Headers => {
  const headers = new Headers();
  headers.set('access-control-allow-origin', resolveCorsOrigin(requestOrigin, fallbackOrigin, allowedOrigins));
  headers.set('access-control-allow-methods', 'GET,HEAD,POST,OPTIONS');
  headers.set('access-control-allow-headers', 'accept,content-type');
  headers.set('access-control-max-age', '86400');
  headers.set('vary', 'Origin');
  return headers;
};

const cachePolicy = (pathname: string): string =>
  /\.(?:js|css|png|jpg|jpeg|webp|avif|svg|woff2?)$/i.test(pathname)
    ? 'public, max-age=31536000, immutable'
    : 'public, s-maxage=600, stale-while-revalidate=86400';

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    const allowedOrigins = parseAllowedOrigins(env.GPT_ALLOWED_ORIGINS);
    const requestOrigin = request.headers.get('Origin');
    const fallbackOrigin = `${url.protocol}//${url.host}`;

    if (request.method === 'OPTIONS') {
      const cors = buildCorsHeaders(requestOrigin, fallbackOrigin, allowedOrigins);
      cors.set('content-length', '0');
      return new Response(null, { status: 204, headers: cors });
    }

    const origin = pickOrigin(url.hostname, env);
    const upstream = new URL(request.url.replace(url.origin, origin));

    const headers = new Headers(request.headers);
    headers.delete('host');

    const init: RequestInit = {
      method: request.method,
      headers,
      redirect: 'follow',
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    };

    const response = await fetch(upstream.toString(), init);
    const cors = buildCorsHeaders(requestOrigin, fallbackOrigin, allowedOrigins);

    const outgoing = new Headers(response.headers);
    outgoing.set('x-served-by', env.APP_NAME);
    outgoing.set('cache-control', cachePolicy(url.pathname));
    cors.forEach((value, key) => {
      if (key.toLowerCase() === 'vary') {
        const existing = outgoing.get('vary');
        const existingValues = existing
          ? existing
              .split(',')
              .map((entry) => entry.trim())
              .filter(Boolean)
          : [];
        const existingSet = new Set(existingValues.map((entry) => entry.toLowerCase()));

        value
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
          .forEach((entry) => {
            const lower = entry.toLowerCase();
            if (!existingSet.has(lower)) {
              existingValues.push(entry);
              existingSet.add(lower);
            }
          });

        if (existingValues.length > 0) {
          outgoing.set('vary', existingValues.join(', '));
        }

        return;
      }

      outgoing.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      headers: outgoing,
    });
  },
} satisfies ExportedHandler<Env>;
