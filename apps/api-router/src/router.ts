import type { ExportedHandler } from '@cloudflare/workers-types';

type Env = {
  APP_NAME: string;
  PRODUCTION_ASSETS?: string;
  PREVIEW_ASSETS?: string;
  DEV_ASSETS?: string;
};

const mapHostToAssets = (host: string, env: Env) =>
  host.startsWith('preview.') ? (env.PREVIEW_ASSETS ?? 'https://goldshore-org-preview.pages.dev') :
  host.startsWith('dev.')     ? (env.DEV_ASSETS ?? 'https://goldshore-org-dev.pages.dev') :
                                (env.PRODUCTION_ASSETS ?? 'https://goldshore-org.pages.dev');

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
