const TOKEN_HEADER_NAME = "x-gpt-proxy-token";
const ACCESS_JWT_HEADER = "cf-access-jwt-assertion";
const BASE_CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-GPT-Proxy-Token, CF-Access-Jwt-Assertion",
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
  headers.set("content-type", "application/json");

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

const CODING_PURPOSE = "coding";
const DEFAULT_PURPOSE = "chat";
const MODEL_BY_PURPOSE = {
  [CODING_PURPOSE]: "gpt-5-codex",
  [DEFAULT_PURPOSE]: "gpt-5",
};

function resolvePurpose(value) {
  if (typeof value !== "string") {
    return DEFAULT_PURPOSE;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === CODING_PURPOSE ? CODING_PURPOSE : DEFAULT_PURPOSE;
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
  }

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return jsonResponse({ error: "Invalid JSON body." }, { status: 400 }, allowedOrigin);
  }

  const {
    messages,
    prompt,
    model,
    purpose: rawPurpose = DEFAULT_PURPOSE,
    temperature,
    ...rest
  } = payload || {};

  if (!Array.isArray(messages) && typeof prompt !== "string") {
    return jsonResponse({
      error: "Request body must include either a 'messages' array or a 'prompt' string.",
    }, { status: 400 }, allowedOrigin);
  }

  const purpose = resolvePurpose(rawPurpose);

  const chatMessages = Array.isArray(messages)
    ? messages
    : [
        {
          role: "user",
          content: prompt,
        },
      ];

  const selectedModel = model || MODEL_BY_PURPOSE[purpose] || MODEL_BY_PURPOSE[DEFAULT_PURPOSE];

  const openAIOptions = { ...rest };

  if (typeof temperature === "number" && !Number.isNaN(temperature)) {
    openAIOptions.temperature = temperature;
  } else if (!("temperature" in openAIOptions)) {
    openAIOptions.temperature = purpose === CODING_PURPOSE ? 0.2 : 0.7;
  }

  const requestBody = {
    model: selectedModel,
    messages: chatMessages,
    ...openAIOptions,
  };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (error) {
      return jsonResponse({
        error: "Unexpected response from OpenAI API.",
        details: responseText,
      }, { status: 502 }, allowedOrigin);
    }

    if (!response.ok) {
      return jsonResponse({
        error: "OpenAI API request failed.",
        details: data,
      }, { status: response.status }, allowedOrigin);
    }

    return jsonResponse(data, { status: response.status }, allowedOrigin);
  } catch (error) {
    return jsonResponse({
      error: "Failed to contact OpenAI API.",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 502 }, allowedOrigin);
  }
}

export default {
  async fetch(request, env) {
    const allowedOrigin = resolveAllowedOrigin(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: applyCorsHeaders(new Headers(), allowedOrigin),
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
  },
};
