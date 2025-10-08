const TOKEN_HEADER_NAME = "x-gpt-proxy-token";
const ACCESS_JWT_HEADER = "cf-access-jwt-assertion";
const BASE_CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-GPT-Proxy-Token",
const ALLOWED_ORIGINS = new Set([
  "https://goldshore.org",
  "https://www.goldshore.org",
  "https://goldshore-org.pages.dev",
  "http://localhost:8788",
]);

const BASE_CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
};
const DEFAULT_CF_ACCESS_JWKS_URL = "https://rmarston.cloudflareaccess.com/cdn-cgi/access/certs";

const jwksCache = new Map();

function decodeBase64Url(value) {
  let normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  if (padding) {
    normalized += "=".repeat(4 - padding);
  }

  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function decodeBase64UrlJSON(value) {
  const bytes = decodeBase64Url(value);
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text);
}

async function getJwkForKid(jwksUrl, kid) {
  const cacheEntry = jwksCache.get(jwksUrl);
  const now = Date.now();
  if (cacheEntry && cacheEntry.expiresAt > now) {
    const cachedKey = cacheEntry.keys.find((key) => key.kid === kid);
    if (cachedKey) {
      return cachedKey;
    }
  }

  const response = await fetch(jwksUrl, {
    headers: { "accept": "application/json" },
    cf: { cacheTtl: 300, cacheEverything: true },
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch Cloudflare Access JWKs (${response.status})`);
  }

  const data = await response.json();
  const keys = Array.isArray(data?.keys) ? data.keys : [];
  const expiresAt = now + 5 * 60 * 1000;
  jwksCache.set(jwksUrl, { keys, expiresAt });

  return keys.find((key) => key.kid === kid) || null;
}

async function verifyAccessJWT(assertion, env) {
  const [encodedHeader, encodedPayload, encodedSignature] = assertion.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error("Malformed Cloudflare Access JWT.");
  }

  const header = decodeBase64UrlJSON(encodedHeader);
  const payload = decodeBase64UrlJSON(encodedPayload);

  if (header.alg !== "RS256") {
    throw new Error("Unsupported Cloudflare Access signing algorithm.");
  }

  const jwksUrl = env.CF_ACCESS_JWKS_URL || DEFAULT_CF_ACCESS_JWKS_URL;
  const jwk = await getJwkForKid(jwksUrl, header.kid);
  if (!jwk) {
    throw new Error("Cloudflare Access signing key not found.");
  }

  const verificationKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["verify"],
  );

  const signedContent = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  const signature = decodeBase64Url(encodedSignature);
  const signatureValid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    verificationKey,
    signature,
    signedContent,
  );

  if (!signatureValid) {
    throw new Error("Invalid Cloudflare Access signature.");
  }

  const audience = env.CF_ACCESS_AUD || env.CF_ACCESS_AUDIENCE;
  if (audience) {
    const audClaim = payload.aud;
    const matchesAudience = Array.isArray(audClaim)
      ? audClaim.includes(audience)
      : audClaim === audience;

    if (!matchesAudience) {
      throw new Error("Cloudflare Access audience mismatch.");
    }
  }

  const issuer = env.CF_ACCESS_ISS || env.CF_ACCESS_ISSUER;
  if (issuer && payload.iss !== issuer) {
    throw new Error("Cloudflare Access issuer mismatch.");
  }

  const currentTime = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && currentTime >= payload.exp) {
    throw new Error("Cloudflare Access token expired.");
  }

  if (typeof payload.nbf === "number" && currentTime < payload.nbf) {
    throw new Error("Cloudflare Access token not yet valid.");
  }

  return payload;
}

async function requireCloudflareAccess(request, env) {
  const audience = env.CF_ACCESS_AUD || env.CF_ACCESS_AUDIENCE;
  if (!audience) {
    // No audience configured; skip Access enforcement for this environment.
    return { success: true };
  }

  const assertion = request.headers.get(ACCESS_JWT_HEADER);
  if (!assertion) {
    return {
      success: false,
      status: 401,
      message: "Missing Cloudflare Access JWT.",
    };
  }

  try {
    await verifyAccessJWT(assertion, env);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      status: 403,
      message: error instanceof Error ? error.message : "Cloudflare Access validation failed.",
    };
  }
}

function parseAllowedOrigins(env) {
  const raw = env?.GPT_ALLOWED_ORIGINS;
  if (typeof raw !== "string") {
    return [];
  }

  return raw
    .split(/[,\n\r]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function resolveAllowedOrigin(request, env) {
  const requestOrigin = request.headers.get("Origin");
  if (typeof requestOrigin !== "string" || requestOrigin.trim() === "") {
    return null;
  }

  const allowedOrigins = parseAllowedOrigins(env);
  if (allowedOrigins.length === 0) {
    return null;
  }

  const normalizedOrigin = requestOrigin.trim();
  for (const allowed of allowedOrigins) {
    if (allowed === "*" || allowed === normalizedOrigin) {
      return normalizedOrigin;
    }
  }

  return null;
}

function applyCorsHeaders(headers, allowedOrigin) {
  for (const [key, value] of Object.entries(BASE_CORS_HEADERS)) {
    headers.set(key, value);
  }

  if (allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
  } else {
    headers.delete("Access-Control-Allow-Origin");
  }

  headers.append("Vary", "Origin");

  return headers;
}

function jsonResponse(body, init = {}, allowedOrigin) {
  const headers = applyCorsHeaders(new Headers(init.headers || {}), allowedOrigin);
function resolveAllowedOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) {
    return null;
  }

  return ALLOWED_ORIGINS.has(origin) ? origin : null;
}

function createCorsHeaders(request) {
  const headers = new Headers(BASE_CORS_HEADERS);
  headers.append("Vary", "Origin");
  const allowedOrigin = resolveAllowedOrigin(request);

  if (allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
  }

  return headers;
}

function jsonResponse(request, body, init = {}) {
  const headers = new Headers(init.headers || {});
  const corsHeaders = createCorsHeaders(request);

  for (const [key, value] of corsHeaders.entries()) {
    headers.set(key, value);
  }

const BASE_CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
};

const DEFAULT_MODEL = "gpt-4.1-mini";

const ALLOWED_CHAT_COMPLETION_OPTIONS = new Set([
  "frequency_penalty",
  "logit_bias",
  "max_tokens",
  "n",
  "presence_penalty",
  "response_format",
  "stop",
  "stream",
  "temperature",
  "top_p",
  "tools",
  "tool_choice",
  "parallel_tool_calls",
  "user",
]);

function withCorsHeaders(origin, headers = new Headers()) {
  const result = new Headers(headers);
  for (const [key, value] of Object.entries(BASE_CORS_HEADERS)) {
    result.set(key, value);
  }
  if (origin) {
    result.set("Access-Control-Allow-Origin", origin);
  }
  return result;
}

function jsonResponse(body, init = {}, origin) {
  const headers = withCorsHeaders(origin, init.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

function errorResponse(message, status = 400, details, origin) {
  const payload = { error: message };
  if (details !== undefined) {
    payload.details = details;
  }
  return jsonResponse(payload, { status }, origin);
}

function parseAllowedOrigins(env) {
  const raw = env.GPT_ALLOWED_ORIGINS ?? env.ALLOWED_ORIGINS ?? "";
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");
}

function resolveAllowedOrigin(request, env) {
  const allowedOrigins = parseAllowedOrigins(env);
  if (allowedOrigins.length === 0) {
    return {
      ok: false,
      status: 500,
      message: "GPT proxy allowed origins not configured.",
      origin: null,
    };
  }

  const originHeader = request.headers.get("origin");
  if (originHeader === null || originHeader === "") {
    return { ok: true, origin: null };
  }

  if (!allowedOrigins.includes(originHeader)) {
    return {
      ok: false,
      status: 403,
      message: "Origin not allowed.",
      origin: null,
    };
  }

  return { ok: true, origin: originHeader };
}

async function handlePost(request, env, allowedOrigin) {
  if (!env.OPENAI_API_KEY) {
    return jsonResponse({ error: "Missing OpenAI API key." }, { status: 500 }, allowedOrigin);
  }

  const expectedToken = env.GPT_PROXY_TOKEN;
  if (!expectedToken) {
    return jsonResponse({ error: "Missing GPT proxy token." }, { status: 500 }, allowedOrigin);
  }

  const providedToken = request.headers.get(TOKEN_HEADER_NAME);
  if (!providedToken) {
    return jsonResponse({ error: "Missing authentication token." }, { status: 401 }, allowedOrigin);
  }

  if (providedToken !== expectedToken) {
    return jsonResponse({ error: "Invalid authentication token." }, { status: 403 }, allowedOrigin);
    return jsonResponse(request, { error: "Missing OpenAI API key." }, { status: 500 });
  }

  if (!env.GPT_PROXY_SECRET) {
    return jsonResponse(request, { error: "Missing GPT proxy secret." }, { status: 500 });
  }

  const providedSecret = request.headers.get("x-api-key");
  if (providedSecret !== env.GPT_PROXY_SECRET) {
    return jsonResponse(request, { error: "Unauthorized." }, { status: 401 });
function requireProxyToken(env) {
  const token = env.GPT_PROXY_TOKEN ?? env.GPT_ACCESS_TOKEN ?? null;
  if (!token) {
    return {
      ok: false,
      status: 500,
      message: "GPT proxy access token not configured.",
    };
  }
  return { ok: true, token };
}

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return jsonResponse({ error: "Invalid JSON body." }, { status: 400 }, allowedOrigin);
    return jsonResponse(request, { error: "Invalid JSON body." }, { status: 400 });
function validateAuthorization(request, env) {
  const tokenResult = requireProxyToken(env);
  if (!tokenResult.ok) {
    return tokenResult;
  }

  const authorization = request.headers.get("authorization");
  if (!authorization || !authorization.toLowerCase().startsWith("bearer ")) {
    return {
      ok: false,
      status: 401,
      message: "Missing or invalid Authorization header.",
    };
  }

  const providedToken = authorization.slice(7).trim();
  if (providedToken !== tokenResult.token) {
    return {
      ok: false,
      status: 401,
      message: "Unauthorized.",
    };
  }

  return { ok: true };
}

function normalizeMessage(message, index) {
  if (message === null || typeof message !== "object" || Array.isArray(message)) {
    throw new Error(`messages[${index}] must be an object.`);
  }

  const { role, content, name } = message;

  if (typeof role !== "string" || role.trim() === "") {
    throw new Error(`messages[${index}].role must be a non-empty string.`);
  }

  if (content === undefined) {
    throw new Error(`messages[${index}].content is required.`);
  }

  let normalizedContent;
  if (typeof content === "string") {
    if (content.trim() === "") {
      throw new Error(`messages[${index}].content must not be empty.`);
    }
    normalizedContent = content;
  } else if (Array.isArray(content)) {
    const parts = content
      .map((item, partIndex) => {
        if (item && typeof item === "object" && typeof item.text === "string") {
          return item.text;
        }
        throw new Error(
          `messages[${index}].content[${partIndex}] must be a text object when providing an array.`,
        );
      })
      .join("\n");
    if (parts.trim() === "") {
      throw new Error(`messages[${index}].content must include non-empty text.`);
    }
    normalizedContent = parts;
  } else if (content && typeof content === "object" && typeof content.text === "string") {
    if (content.text.trim() === "") {
      throw new Error(`messages[${index}].content.text must not be empty.`);
    }
    normalizedContent = content.text;
  } else {
    throw new Error(`messages[${index}].content must be a string or text object.`);
  }

  const normalized = {
    role: role.trim(),
    content: normalizedContent,
  };

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim() === "") {
      throw new Error(`messages[${index}].name must be a non-empty string when provided.`);
    }
    normalized.name = name.trim();
  }

  return normalized;
}

function buildChatCompletionPayload(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Request body must be a JSON object.");
  }

  const { model = DEFAULT_MODEL, messages, prompt, ...rest } = payload;

  if (!Array.isArray(messages) && typeof prompt !== "string") {
    return jsonResponse(request, {
      error: "Request body must include either a 'messages' array or a 'prompt' string.",
    }, { status: 400 }, allowedOrigin);
    }, { status: 400 });
  if ((!Array.isArray(messages) || messages.length === 0) && typeof prompt !== "string") {
    throw new Error("Provide either a non-empty 'messages' array or a 'prompt' string.");
  }

  if (typeof model !== "string" || model.trim() === "") {
    throw new Error("'model' must be a non-empty string when provided.");
  }

  const normalizedMessages = (Array.isArray(messages) && messages.length > 0
    ? messages
    : [
        {
          role: "user",
          content: prompt,
        },
      ]
  ).map((message, index) => normalizeMessage(message, index));

  const requestBody = {
    model: model.trim(),
    messages: normalizedMessages,
  };

  for (const [key, value] of Object.entries(rest)) {
    if (ALLOWED_CHAT_COMPLETION_OPTIONS.has(key)) {
      requestBody[key] = value;
    }
  }

  return requestBody;
}

async function handlePost(request, env, origin) {
  if (!env.OPENAI_API_KEY) {
    return errorResponse("Missing OpenAI API key.", 500, undefined, origin);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return errorResponse("Invalid JSON body.", 400, undefined, origin);
  }

  let requestBody;
  try {
    requestBody = buildChatCompletionPayload(payload);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : String(error),
      400,
      undefined,
      origin,
    );
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      return jsonResponse(request, {
        error: "Unexpected response from OpenAI API.",
        details: responseText,
      }, { status: 502 }, allowedOrigin);
    }

    if (!response.ok) {
      return jsonResponse(request, {
        error: "OpenAI API request failed.",
        details: data,
      }, { status: response.status }, allowedOrigin);
    }

    return jsonResponse(data, { status: response.status }, allowedOrigin);
    return jsonResponse(request, data, { status: response.status });
  } catch (error) {
    return jsonResponse(request, {
      error: "Failed to contact OpenAI API.",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 502 }, allowedOrigin);
    }, { status: 502 });
      return errorResponse("Unexpected response from OpenAI API.", 502, text, origin);
    }

    if (!response.ok) {
      return errorResponse(
        "OpenAI API request failed.",
        response.status,
        data,
        origin,
      );
    }

    return jsonResponse(data, { status: response.status }, origin);
  } catch (error) {
    return errorResponse(
      "Failed to contact OpenAI API.",
      502,
      error instanceof Error ? error.message : String(error),
      origin,
    );
  }
}

export default {
  async fetch(request, env) {
    const allowedOrigin = resolveAllowedOrigin(request, env);
    const originResult = resolveAllowedOrigin(request, env);
    if (!originResult.ok) {
      return jsonResponse(
        { error: originResult.message },
        { status: originResult.status },
        originResult.origin,
      );
    }

    const origin = originResult.origin;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: applyCorsHeaders(new Headers(), allowedOrigin),
        headers: createCorsHeaders(request),
        headers: withCorsHeaders(origin),
      });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, { status: 405 }, allowedOrigin);
    }

    const accessCheck = await requireCloudflareAccess(request, env);
    if (!accessCheck.success) {
      return jsonResponse({ error: accessCheck.message }, { status: accessCheck.status }, allowedOrigin);
    }

    return handlePost(request, env, allowedOrigin);
      return jsonResponse(request, { error: "Method not allowed." }, { status: 405 });
      return errorResponse("Method not allowed.", 405, undefined, origin);
    }

    const authResult = validateAuthorization(request, env);
    if (!authResult.ok) {
      return errorResponse(authResult.message, authResult.status, undefined, origin);
    }

    return handlePost(request, env, origin);
  },
};
