import type { ExportedHandler } from '@cloudflare/workers-types';

type Env = {
  APP_NAME: string;
  PRODUCTION_ASSETS?: string;
  PREVIEW_ASSETS?: string;
  DEV_ASSETS?: string;
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

const buildCorsHeaders = (origin: string | null): Headers => {
  const headers = new Headers();
  if (origin) {
    headers.set('access-control-allow-origin', origin);
  }
  headers.set('access-control-allow-methods', 'GET,HEAD,POST,OPTIONS');
  headers.set('access-control-allow-headers', 'accept,content-type');
  headers.set('access-control-max-age', '86400');
  headers.set('vary', 'origin');
  return headers;
};

const isAllowedOrigin = (origin: URL): boolean => {
  if (origin.hostname === 'goldshore.org' || origin.hostname === 'localhost') {
    return true;
  }

  if (origin.hostname.endsWith('.goldshore.org')) {
    return true;
  }

  if (origin.hostname === 'goldshore-org.pages.dev' || origin.hostname.endsWith('.goldshore-org.pages.dev')) {
    return true;
  }

  return false;
};

const resolveCorsOrigin = (req: Request): string | null => {
  const headerOrigin = req.headers.get('origin');
  if (!headerOrigin || headerOrigin === 'null') {
    return null;
  }

  try {
    const parsedOrigin = new URL(headerOrigin);
    return isAllowedOrigin(parsedOrigin) ? parsedOrigin.origin : null;
  } catch {
    return null;
  }
};

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    const corsOrigin = resolveCorsOrigin(req);

    const fallbackOrigin = `${url.protocol}//${url.host}`;
    const requestOrigin = getCorsOrigin(req, fallbackOrigin);

    if (req.method === 'OPTIONS') {
      const cors = buildCorsHeaders(corsOrigin);
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

    const responseHeaders = new Headers(proxiedResponse.headers);
    responseHeaders.set('x-served-by', env.APP_NAME);
    const cors = buildCorsHeaders(corsOrigin);
    cors.forEach((value, key) => responseHeaders.set(key, value));

    const outgoing = new Headers(response.headers);
    outgoing.set('x-served-by', env.APP_NAME);
    outgoing.set('cache-control', cachePolicy(url.pathname));
    cors.forEach((value, key) => outgoing.set(key, value));

    return new Response(response.body, {
      status: response.status,
      headers: outgoing,
    });
  },
} satisfies ExportedHandler<Env>;
