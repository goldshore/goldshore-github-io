const ALLOWED_METHODS = "POST, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization, X-GPT-Proxy-Token, X-API-Key";
const CODING_PURPOSE = "coding";
const DEFAULT_PURPOSE = "chat";
const MODEL_BY_PURPOSE = {
  [CODING_PURPOSE]: "gpt-5-codex",
  [DEFAULT_PURPOSE]: "gpt-5",
};
const DEFAULT_MODEL = MODEL_BY_PURPOSE[DEFAULT_PURPOSE];
const BASE_SUPPORTED_MODELS = new Set(Object.values(MODEL_BY_PURPOSE));
const ALLOWED_CHAT_COMPLETION_OPTIONS = new Set([
  "frequency_penalty",
  "logit_bias",
  "logprobs",
  "max_tokens",
  "n",
  "presence_penalty",
  "response_format",
  "seed",
  "stop",
  "temperature",
  "top_logprobs",
  "top_p",
  "user",
]);

function resolvePurpose(value) {
  if (typeof value !== "string") {
    return DEFAULT_PURPOSE;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === CODING_PURPOSE ? CODING_PURPOSE : DEFAULT_PURPOSE;
}

function getAllowedOrigins(env) {
  return (env.GPT_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function getAllowedModels(env) {
  const raw = env.GPT_ALLOWED_MODELS;
  if (typeof raw !== "string" || raw.trim() === "") {
    return new Set(BASE_SUPPORTED_MODELS);
  }

  const entries = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (entries.includes("*")) {
    return null;
  }

  return new Set([...BASE_SUPPORTED_MODELS, ...entries]);
}

function resolveAllowedOrigin(requestOrigin, allowedOrigins) {
  let parsed;
  try {
    parsed = new URL(requestOrigin);
  } catch (error) {
    return null;
  }

  for (const allowed of allowedOrigins) {
    if (allowed === "*") {
      return parsed.origin;
    }

    try {
      const allowedUrl = new URL(allowed);
      if (parsed.origin === allowedUrl.origin) {
        return parsed.origin;
      }
    } catch (error) {
      // Skip invalid allowlist entries.
    }
  }

  return null;
}

function buildCorsHeaders(origin) {
  const headers = new Headers();
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
  headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

function mergeHeaders(target, source) {
  for (const [key, value] of source.entries()) {
    target.set(key, value);
  }
}

function jsonResponse(body, init = {}, corsOrigin = null) {
  const headers = new Headers(init.headers || {});
  const corsHeaders = buildCorsHeaders(corsOrigin);
  mergeHeaders(headers, corsHeaders);

  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }

  return new Response(JSON.stringify(body), { ...init, headers });
}

function errorResponse(message, status = 500, extras = undefined, corsOrigin = null, init = {}) {
  const payload = { error: message };
  if (extras && typeof extras === "object") {
    Object.assign(payload, extras);
  }

  return jsonResponse(payload, { status, ...init }, corsOrigin);
}

function constantTimeEquals(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  if (aBytes.length !== bBytes.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < aBytes.length; i += 1) {
    mismatch |= aBytes[i] ^ bBytes[i];
  }

  return mismatch === 0;
}

function extractBearerToken(header) {
  if (!header) {
    return null;
  }

  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function getTokenFromHeaders(request) {
  const authorization = request.headers.get("Authorization");
  const bearerToken = extractBearerToken(authorization);
  if (bearerToken) {
    return bearerToken;
  }

  const proxyHeader = request.headers.get("X-GPT-Proxy-Token");
  if (proxyHeader && proxyHeader.trim() !== "") {
    return proxyHeader.trim();
  }

  const apiKeyHeader = request.headers.get("x-api-key");
  if (apiKeyHeader && apiKeyHeader.trim() !== "") {
    return apiKeyHeader.trim();
  }

  return null;
}

function validateOrigin(request, env) {
  const allowedOrigins = getAllowedOrigins(env);
  if (allowedOrigins.length === 0) {
    return {
      ok: false,
      response: jsonResponse(
        { error: "Server misconfigured: GPT_ALLOWED_ORIGINS is not set." },
        { status: 500 }
      ),
    };
  }

  const requestOrigin = request.headers.get("Origin");
  if (!requestOrigin) {
    return { ok: true, origin: null };
  }

  const allowedOrigin = resolveAllowedOrigin(requestOrigin, allowedOrigins);
  if (!allowedOrigin) {
    return {
      ok: false,
      response: jsonResponse(
        { error: "Origin is not allowed." },
        { status: 403 }
      ),
    };
  }

  return { ok: true, origin: allowedOrigin };
}

function authenticateRequest(request, env, corsOrigin) {
  if (!env.GPT_SHARED_SECRET) {
    return {
      ok: false,
      response: jsonResponse(
        { error: "Server misconfigured: GPT_SHARED_SECRET is not set." },
        { status: 500 },
        corsOrigin
      ),
    };
  }

  const providedToken = getTokenFromHeaders(request);
  if (!providedToken) {
    return {
      ok: false,
      response: jsonResponse(
        { error: "Missing authentication token." },
        { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
        corsOrigin
      ),
    };
  }

  if (!constantTimeEquals(providedToken, env.GPT_SHARED_SECRET)) {
    return {
      ok: false,
      response: jsonResponse(
        { error: "Invalid authentication token." },
        { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
        corsOrigin
      ),
    };
  }

  return { ok: true };
}

function normalizeMessage(message, index) {
  if (typeof message !== "object" || message === null || Array.isArray(message)) {
    throw new Error(`messages[${index}] must be an object.`);
  }

  const { role, content, name } = message;

  if (typeof role !== "string" || role.trim() === "") {
    throw new Error(`messages[${index}].role must be a non-empty string.`);
  }

  if (typeof content !== "string" || content.trim() === "") {
    throw new Error(`messages[${index}].content must be a non-empty string.`);
  }

  const normalized = {
    role: role.trim(),
    content: content.trim(),
  };

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim() === "") {
      throw new Error(`messages[${index}].name must be a non-empty string when provided.`);
    }
    normalized.name = name.trim();
  }

  return normalized;
}

function buildChatCompletionPayload(payload, allowedModels) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Request body must be a JSON object.");
  }

  const { model, purpose, messages, prompt, stream, ...rest } = payload;

  const resolvedPurpose = resolvePurpose(purpose);
  const defaultModel = MODEL_BY_PURPOSE[resolvedPurpose] || DEFAULT_MODEL;
  let trimmedModel;

  if (typeof model === "string" && model.trim() !== "") {
    trimmedModel = model.trim();
  } else {
    trimmedModel = defaultModel;
  }

  if (
    allowedModels &&
    allowedModels.size > 0 &&
    !allowedModels.has(trimmedModel)
  ) {
    throw new Error("Model is not supported.");
  }

  if (!Array.isArray(messages) && typeof prompt !== "string") {
    throw new Error("Request body must include either a 'messages' array or a 'prompt' string.");
  }

  const normalizedMessages = (Array.isArray(messages) && messages.length > 0
    ? messages
    : [
        {
          role: "user",
          content: typeof prompt === "string" ? prompt : "",
        },
      ])
    .map((message, index) => normalizeMessage(message, index));

  if (typeof stream !== "undefined") {
    if (typeof stream === "string") {
      const normalized = stream.trim().toLowerCase();
      if (normalized && normalized !== "false" && normalized !== "0") {
        throw new Error("stream option is not supported by this proxy.");
      }
    } else if (stream) {
      throw new Error("stream option is not supported by this proxy.");
    }
  }

  const requestBody = {
    model: trimmedModel,
    messages: normalizedMessages,
  };

  for (const [key, value] of Object.entries(rest)) {
    if (!ALLOWED_CHAT_COMPLETION_OPTIONS.has(key) || value === undefined) {
      continue;
    }

    requestBody[key] = value;
  }

  return requestBody;
}

async function handlePost(request, env, corsOrigin) {
  if (!env.OPENAI_API_KEY) {
    return errorResponse("Missing OpenAI API key.", 500, undefined, corsOrigin);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return errorResponse("Invalid JSON body.", 400, undefined, corsOrigin);
  }

  const allowedModels = getAllowedModels(env);
  let requestBody;
  try {
    requestBody = buildChatCompletionPayload(payload, allowedModels);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : String(error),
      400,
      undefined,
      corsOrigin
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

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (error) {
      return errorResponse(
        "Unexpected response from OpenAI API.",
        502,
        { details: responseText },
        corsOrigin
      );
    }

    if (!response.ok) {
      return errorResponse(
        "OpenAI API request failed.",
        response.status,
        { details: data },
        corsOrigin
      );
    }

    return jsonResponse(data, { status: response.status }, corsOrigin);
  } catch (error) {
    return errorResponse(
      "Failed to contact OpenAI API.",
      502,
      { details: error instanceof Error ? error.message : String(error) },
      corsOrigin
    );
  }
}

export default {
  async fetch(request, env) {
    const originCheck = validateOrigin(request, env);
    if (!originCheck.ok) {
      return originCheck.response;
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(originCheck.origin),
      });
    }

    if (request.method !== "POST") {
      return jsonResponse(
        { error: "Method not allowed." },
        { status: 405 },
        originCheck.origin
      );
    }

    const auth = authenticateRequest(request, env, originCheck.origin);
    if (!auth.ok) {
      return auth.response;
    }

    return handlePost(request, env, originCheck.origin);
  },
};
