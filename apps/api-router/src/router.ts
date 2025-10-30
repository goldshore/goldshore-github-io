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
