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

const cachePolicy = (pathname: string): string =>
  /\.(?:js|css|png|jpg|jpeg|webp|avif|svg|woff2?)$/i.test(pathname)
    ? 'public, max-age=31536000, immutable'
    : 'public, s-maxage=600, stale-while-revalidate=86400';

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const origin = pickOrigin(url.hostname, env);
    const upstream = new URL(request.url.replace(url.origin, origin));

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

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  },
} satisfies ExportedHandler<Env>;
