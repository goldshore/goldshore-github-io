import type { ExportedHandler } from '@cloudflare/workers-types';

type Env = {
  APP_NAME: string;
  PRODUCTION_ASSETS?: string;
  PREVIEW_ASSETS?: string;
  DEV_ASSETS?: string;
  OPENAI_API_KEY?: string;
  OPENAI_PROJECT_ID?: string;
  GPT_PROXY_TOKEN?: string;
  GPT_ALLOWED_ORIGINS?: string;
};

const TOKEN_HEADER_NAME = 'x-gpt-proxy-token';
const BASE_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-GPT-Proxy-Token',
};

const CODING_PURPOSE = 'coding';
const DEFAULT_PURPOSE = 'chat';
const MODEL_BY_PURPOSE: Record<string, string> = {
  [CODING_PURPOSE]: 'gpt-5-codex',
  [DEFAULT_PURPOSE]: 'gpt-5',
};

const mapHostToAssets = (host: string, env: Env) =>
  host.startsWith('preview.') ? (env.PREVIEW_ASSETS ?? 'https://goldshore-org-preview.pages.dev') :
  host.startsWith('dev.')     ? (env.DEV_ASSETS ?? 'https://goldshore-org-dev.pages.dev') :
                                (env.PRODUCTION_ASSETS ?? 'https://goldshore-org.pages.dev');

const parseAllowedOrigins = (env: Env) => {
  const raw = env.GPT_ALLOWED_ORIGINS;
  if (typeof raw !== 'string') {
    return [] as string[];
  }

  return raw
    .split(/[\n\r,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
};

const resolveAllowedOrigin = (request: Request, env: Env) => {
  const requestOrigin = request.headers.get('Origin');
  if (!requestOrigin) {
    return null;
  }

  const allowedOrigins = parseAllowedOrigins(env);
  if (allowedOrigins.length === 0) {
    return null;
  }

  const normalizedOrigin = requestOrigin.trim();
  for (const allowed of allowedOrigins) {
    if (allowed === '*' || allowed === normalizedOrigin) {
      return normalizedOrigin;
    }
  }

  return null;
};

const applyCorsHeaders = (headers: Headers, allowedOrigin: string | null) => {
  for (const [key, value] of Object.entries(BASE_CORS_HEADERS)) {
    headers.set(key, value);
  }

  if (allowedOrigin) {
    headers.set('Access-Control-Allow-Origin', allowedOrigin);
  } else {
    headers.delete('Access-Control-Allow-Origin');
  }

  headers.append('Vary', 'Origin');
  return headers;
};

const jsonResponse = (body: unknown, init: ResponseInit = {}, allowedOrigin: string | null) => {
  const headers = applyCorsHeaders(new Headers(init.headers), allowedOrigin);
  headers.set('content-type', 'application/json');

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
};

const resolvePurpose = (value: unknown) => {
  if (typeof value !== 'string') {
    return DEFAULT_PURPOSE;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === CODING_PURPOSE ? CODING_PURPOSE : DEFAULT_PURPOSE;
};

const handleGptPost = async (request: Request, env: Env, allowedOrigin: string | null) => {
  if (!env.OPENAI_API_KEY) {
    return jsonResponse({ error: 'Missing OpenAI API key.' }, { status: 500 }, allowedOrigin);
  }

  const expectedToken = env.GPT_PROXY_TOKEN;
  if (!expectedToken) {
    return jsonResponse({ error: 'Missing GPT proxy token.' }, { status: 500 }, allowedOrigin);
  }

  const providedToken = request.headers.get(TOKEN_HEADER_NAME);
  if (!providedToken) {
    return jsonResponse({ error: 'Missing authentication token.' }, { status: 401 }, allowedOrigin);
  }

  if (providedToken !== expectedToken) {
    return jsonResponse({ error: 'Invalid authentication token.' }, { status: 403 }, allowedOrigin);
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, { status: 400 }, allowedOrigin);
  }

  const {
    messages,
    prompt,
    model,
    purpose: rawPurpose = DEFAULT_PURPOSE,
    temperature,
    ...rest
  } = payload ?? {};

  if (!Array.isArray(messages) && typeof prompt !== 'string') {
    return jsonResponse({
      error: "Request body must include either a 'messages' array or a 'prompt' string.",
    }, { status: 400 }, allowedOrigin);
  }

  const purpose = resolvePurpose(rawPurpose);
  const chatMessages = Array.isArray(messages)
    ? messages
    : [{ role: 'user', content: prompt }];

  const selectedModel = model || MODEL_BY_PURPOSE[purpose] || MODEL_BY_PURPOSE[DEFAULT_PURPOSE];

  const openAIOptions: Record<string, unknown> = { ...rest };
  if (typeof temperature === 'number' && !Number.isNaN(temperature)) {
    openAIOptions.temperature = temperature;
  } else if (!('temperature' in openAIOptions)) {
    openAIOptions.temperature = purpose === CODING_PURPOSE ? 0.2 : 0.7;
  }

  const requestBody = {
    model: selectedModel,
    messages: chatMessages,
    ...openAIOptions,
  };

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        ...(env.OPENAI_PROJECT_ID ? { 'OpenAI-Project': env.OPENAI_PROJECT_ID } : {}),
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(responseText);
    } catch {
      return jsonResponse({
        error: 'Unexpected response from OpenAI API.',
        details: responseText,
      }, { status: 502 }, allowedOrigin);
    }

    if (!response.ok) {
      return jsonResponse({
        error: 'OpenAI API request failed.',
        details: data,
      }, { status: response.status }, allowedOrigin);
    }

    return jsonResponse(data, { status: response.status }, allowedOrigin);
  } catch (error) {
    return jsonResponse({
      error: 'Failed to contact OpenAI API.',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 502 }, allowedOrigin);
  }
};

const handleGpt = async (request: Request, env: Env) => {
  const allowedOrigin = resolveAllowedOrigin(request, env);
  const requestOrigin = request.headers.get('Origin');
  const hasAllowedOriginsConfigured = parseAllowedOrigins(env).length > 0;

  if (hasAllowedOriginsConfigured && requestOrigin && !allowedOrigin) {
    return jsonResponse({ error: 'Origin not allowed.' }, { status: 403 }, allowedOrigin);
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: applyCorsHeaders(new Headers(), allowedOrigin),
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, { status: 405 }, allowedOrigin);
  }

  return handleGptPost(request, env, allowedOrigin);
};

const handler: ExportedHandler<Env> = {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === '/api/gpt') {
      return handleGpt(req, env);
    }

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
