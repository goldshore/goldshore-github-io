import type { ExportedHandler } from '@cloudflare/workers-types';

type Env = {
  APP_NAME: string;
  PRODUCTION_ASSETS?: string;
  PREVIEW_ASSETS?: string;
  DEV_ASSETS?: string;
};

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
