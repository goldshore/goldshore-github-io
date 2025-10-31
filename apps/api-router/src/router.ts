import type { ExportedHandler } from '@cloudflare/workers-types';

type Env = {
  APP_NAME: string;
  PRODUCTION_ASSETS?: string;
  PREVIEW_ASSETS?: string;
  DEV_ASSETS?: string;
};

const mapHostToAssets = (host: string, env: Env): string =>
  host.startsWith('preview.')
    ? env.PREVIEW_ASSETS ?? 'https://goldshore-org-preview.pages.dev'
    : host.startsWith('dev.')
      ? env.DEV_ASSETS ?? 'https://goldshore-org-dev.pages.dev'
      : env.PRODUCTION_ASSETS ?? 'https://goldshore-org.pages.dev';

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
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url);

    const corsOrigin = resolveCorsOrigin(req);

    if (req.method === 'OPTIONS') {
      const cors = buildCorsHeaders(corsOrigin);
      cors.set('content-length', '0');
      return new Response(null, { status: 204, headers: cors });
    }

    const assetsOrigin = mapHostToAssets(url.hostname, env);
    const proxyUrl = new URL(req.url.replace(url.origin, assetsOrigin));

    const headers = new Headers(req.headers);
    headers.delete('host');

    const body = req.method === 'GET' || req.method === 'HEAD'
      ? undefined
      : await req.arrayBuffer();

    const proxiedResponse = await fetch(proxyUrl.toString(), {
      method: req.method,
      headers,
      body,
      redirect: 'follow'
    });

    const responseHeaders = new Headers(proxiedResponse.headers);
    responseHeaders.set('x-served-by', env.APP_NAME);
    const cors = buildCorsHeaders(corsOrigin);
    cors.forEach((value, key) => responseHeaders.set(key, value));

    return new Response(proxiedResponse.body, {
      status: proxiedResponse.status,
      headers: responseHeaders
    });
  }
} satisfies ExportedHandler<Env>;
