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

const buildCorsHeaders = (origin: string): Headers => {
  const headers = new Headers();
  headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-methods', 'GET,HEAD,POST,OPTIONS');
  headers.set('access-control-allow-headers', 'accept,content-type');
  headers.set('access-control-max-age', '86400');
  return headers;
};

const cachePolicy = (pathname: string): string =>
  /\.(?:js|css|png|jpg|jpeg|webp|avif|svg|woff2?)$/i.test(pathname)
    ? 'public, max-age=31536000, immutable'
    : 'public, s-maxage=600, stale-while-revalidate=86400';

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      const cors = buildCorsHeaders(`${url.protocol}//${url.host}`);
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
    const cors = buildCorsHeaders(`${url.protocol}//${url.host}`);

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
const mapHostToAssets = (host: string, env: Env) =>
  host.startsWith('preview.') ? (env.PREVIEW_ASSETS ?? 'https://goldshore-org-preview.pages.dev') :
  host.startsWith('dev.')     ? (env.DEV_ASSETS ?? 'https://goldshore-org-dev.pages.dev') :
                                (env.PRODUCTION_ASSETS ?? 'https://goldshore-org.pages.dev');
const DEFAULT_ASSETS = {
  production: 'https://goldshore-org.pages.dev',
  preview: 'https://goldshore-org-preview.pages.dev',
  dev: 'https://goldshore-org-dev.pages.dev',
} as const;

const mapHostToAssets = (host: string, env: Env) => {
  if (host.startsWith('preview.')) return env.PREVIEW_ASSETS ?? DEFAULT_ASSETS.preview;
  if (host.startsWith('dev.')) return env.DEV_ASSETS ?? DEFAULT_ASSETS.dev;
  return env.PRODUCTION_ASSETS ?? DEFAULT_ASSETS.production;
};

const handler: ExportedHandler<Env> = {
  async fetch(req, env) {
    const url = new URL(req.url);
    const assets = mapHostToAssets(url.hostname, env);
    const proxyUrl = new URL(req.url.replace(url.origin, assets));

    const res = await fetch(proxyUrl.toString(), {
      method: req.method,
      headers: req.headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
    });

    const headers = new Headers(res.headers);
    headers.set('x-served-by', env.APP_NAME);

    return new Response(res.body, { status: res.status, headers });
  },
};

export default handler;
