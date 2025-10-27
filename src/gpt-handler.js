const TOKEN_HEADER_NAME = "x-api-key";
const PROXY_TOKEN_HEADER_NAME = "x-gpt-proxy-token";
const BASE_CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-GPT-Proxy-Token, X-API-Key, CF-Access-Jwt-Assertion",
};

const DEFAULT_MODEL = "gpt-4o-mini";
const ALLOWED_METHODS = "POST, OPTIONS";
const ALLOWED_HEADERS =
  "Content-Type, Authorization, X-GPT-Proxy-Token, X-Api-Key, CF-Access-Jwt-Assertion";
const SUPPORTED_MODELS = new Set(["gpt-4o-mini", "gpt-4o", "o4-mini"]);
const ALLOWED_CHAT_COMPLETION_OPTIONS = new Set([
  "frequency_penalty",
  "logit_bias",
  "logprobs",
  "max_tokens",
  "modalities",
  "n",
  "presence_penalty",
  "response_format",
  "seed",
  "stop",
  "temperature",
  "top_logprobs",
  "top_p",
  "tool_choice",
  "tools",
  "user",
  "stream",
]);

const encoder = new TextEncoder();

function getAllowedOrigins(env) {
  return (env.GPT_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== "");
}

function resolveAllowedOrigin(requestOrigin, allowedOrigins) {
  if (typeof requestOrigin !== "string") {
    return null;
  }

  const normalizedOrigin = requestOrigin.trim();
  if (normalizedOrigin === "") {
    return null;
  }

  for (const allowed of allowedOrigins) {
    if (allowed === normalizedOrigin) {
      return normalizedOrigin;
    }
  }

  return null;
}

function buildCorsHeaders(origin) {
  const headers = new Headers();

  for (const [key, value] of Object.entries(BASE_CORS_HEADERS)) {
    headers.set(key, value);
  }

function buildCorsHeaders(origin) {
  const headers = new Headers();
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }

  headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
  headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  return headers;
}

function jsonResponse(body, init = {}, corsOrigin = null) {
  const headers = new Headers(init.headers || {});
  const corsHeaders = buildCorsHeaders(corsOrigin);

  if (init.headers) {
    const initHeaders = new Headers(init.headers);
    for (const [key, value] of initHeaders.entries()) {
      headers.set(key, value);
    }
  }

  const corsHeaders = buildCorsHeaders(origin);
  for (const [key, value] of corsHeaders.entries()) {
    headers.set(key, value);
  }

  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return new Response(JSON.stringify(body), { ...init, headers });
}

function errorResponse(message, status = 400, details, origin) {
  const payload = { error: message };
  if (details !== undefined) {
    payload.details = details;
  }
  return jsonResponse(payload, { status }, origin);
}

function constantTimeEquals(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const encodedA = encoder.encode(a);
  const encodedB = encoder.encode(b);

  if (encodedA.length !== encodedB.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < encodedA.length; index += 1) {
    diff |= encodedA[index] ^ encodedB[index];
  }

  return diff === 0;
}

function extractBearerToken(header) {
  if (!header) {
    return null;
  }

  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function validateOrigin(request, env) {
  const allowedOrigins = getAllowedOrigins(env);
  if (allowedOrigins.length === 0) {
    return {
      ok: false,
      response: errorResponse(
        "Server misconfigured: GPT_ALLOWED_ORIGINS is not set.",
        500,
        undefined,
        null,
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
      response: errorResponse("Origin not allowed.", 403),
    };
  }

  return { ok: true, origin: allowedOrigin };
}

function extractBearerToken(header) {
  if (typeof header !== "string") {
    return null;
  if (!allowedOrigins.includes(requestOrigin)) {
    return {
      ok: false,
      response: errorResponse("Origin not allowed.", 403, undefined, requestOrigin),
    };
  }

  return { ok: true, origin: requestOrigin };
}

function getExpectedSecret(env) {
  return env.GPT_SHARED_SECRET ?? env.GPT_PROXY_SECRET ?? null;
}

function extractProvidedToken(request) {
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

  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function authenticateRequest(request, env, corsOrigin) {
  const expectedToken = getExpectedSecret(env);
  if (!expectedToken) {
    return {
      ok: false,
      response: errorResponse(
        "Server misconfigured: GPT_SHARED_SECRET or GPT_PROXY_SECRET is not set.",
        500,
        undefined,
        corsOrigin,
      ),
    };
  }

  const providedToken = extractProvidedToken(request);
  if (!providedToken) {
    return {
      ok: false,
      response: jsonResponse(
        { error: "Missing authentication token." },
        { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
        corsOrigin,
      ),
    };
  }

  if (!constantTimeEquals(providedToken, expectedToken)) {
    return {
      ok: false,
      response: jsonResponse(
        { error: "Invalid bearer token." },
        { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
        corsOrigin,
      ),
    };
  }

  return null;
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

  const { model = DEFAULT_MODEL, messages, prompt, stream, ...rest } = payload;

  if (typeof model !== "string" || model.trim() === "") {
    throw new Error("model must be a non-empty string.");
  }

  const trimmedModel = model.trim();
  if (SUPPORTED_MODELS.size > 0 && !SUPPORTED_MODELS.has(trimmedModel)) {
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
          content: prompt,
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
    model: typeof model === "string" ? model.trim() : DEFAULT_MODEL,
    model: trimmedModel,
    messages: normalizedMessages,
  };

  for (const [key, value] of Object.entries(rest)) {
    if (!ALLOWED_CHAT_COMPLETION_OPTIONS.has(key) || value === undefined) {
      continue;
    }
    if (key === "stream") {
      if (typeof value !== "boolean") {
        throw new Error("stream option must be a boolean value.");
      }
      if (value) {
        requestBody[key] = true;
      }
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

  let requestBody;
  try {
    requestBody = buildChatCompletionPayload(payload);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : String(error),
      400,
      undefined,
      corsOrigin,
    );
  }

  const wantsStream = requestBody.stream === true;

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
        responseText,
        { body: responseText },
        corsOrigin,
      );
    }

    if (!response.ok) {
      return errorResponse(
        "OpenAI API request failed.",
        response.status,
        data,
        corsOrigin,
      );
    }

    return jsonResponse(data, { status: response.status }, corsOrigin);
  } catch (error) {
    return errorResponse(
      "Failed to contact OpenAI API.",
      502,
      error instanceof Error ? error.message : String(error),
      corsOrigin,
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
      return errorResponse("Method not allowed.", 405, undefined, originCheck.origin);
    }

    const auth = authenticateRequest(request, env, originCheck.origin);
    if (!auth.ok) {
      return auth.response;
    }

    return handlePost(request, env, originCheck.origin);
  },
};
