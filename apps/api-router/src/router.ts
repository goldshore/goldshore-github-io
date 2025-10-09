import type { ExportedHandler } from '@cloudflare/workers-types';

type Env = {
  APP_NAME: string;
  PRODUCTION_ASSETS?: string;
  PREVIEW_ASSETS?: string;
  DEV_ASSETS?: string;
};

const DEFAULT_ORIGINS = {
  production: 'https://goldshore-org.pages.dev',
  preview: 'https://goldshore-org-preview.pages.dev',
  dev: 'https://goldshore-org-dev.pages.dev'
} as const;

const normaliseOrigin = (candidate: string): string | null => {
  const trimmed = candidate.trim();
  if (!trimmed) {
    return null;
  }

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    const pathname = url.pathname === '/'
      ? ''
      : url.pathname.endsWith('/')
        ? url.pathname.slice(0, -1)
        : url.pathname;

    return `${url.protocol}//${url.host}${pathname}`;
  } catch (error) {
    return null;
  }
};

const selectOrigin = (raw: string | undefined, fallback: string): string => {
  if (!raw) {
    return fallback;
  }

  const candidates = raw.split(',');
  for (const candidate of candidates) {
    const normalised = normaliseOrigin(candidate);
    if (normalised) {
      return normalised;
    }
  }

  return fallback;
};

const mapHostToAssets = (host: string, env: Env): string =>
  host.startsWith('preview.')
    ? selectOrigin(env.PREVIEW_ASSETS, DEFAULT_ORIGINS.preview)
    : host.startsWith('dev.')
      ? selectOrigin(env.DEV_ASSETS, DEFAULT_ORIGINS.dev)
      : selectOrigin(env.PRODUCTION_ASSETS, DEFAULT_ORIGINS.production);

const buildCorsHeaders = (origin: string): Headers => {
  const headers = new Headers();
  headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-methods', 'GET,HEAD,POST,OPTIONS');
  headers.set('access-control-allow-headers', 'accept,content-type');
  headers.set('access-control-max-age', '86400');
  return headers;
};

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      const cors = buildCorsHeaders(`${url.protocol}//${url.host}`);
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
    const cors = buildCorsHeaders(`${url.protocol}//${url.host}`);
    cors.forEach((value, key) => responseHeaders.set(key, value));

    return new Response(proxiedResponse.body, {
      status: proxiedResponse.status,
      headers: responseHeaders
    });
  }
} satisfies ExportedHandler<Env>;
