const ALLOWED_METHODS = "POST, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization";
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

function getAllowedOrigins(env) {
  return (env.GPT_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
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
  for (const [key, value] of corsHeaders) {
    headers.set(key, value);
  }

  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }

  headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
  headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);

  return headers;
}

function jsonResponse(body, init = {}, corsOrigin = null) {
  const headers = new Headers(init.headers);
  const corsHeaders = buildCorsHeaders(corsOrigin);

  if (init.headers) {
    const initHeaders = new Headers(init.headers);
    for (const [key, value] of initHeaders.entries()) {
      headers.set(key, value);
    }
  }
  for (const [key, value] of corsHeaders.entries()) {
    headers.set(key, value);
  }

  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return new Response(JSON.stringify(body), { ...init, headers });
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
      response: errorResponse("Origin not allowed.", 403, undefined, requestOrigin),
  if (!allowedOrigins.includes(requestOrigin)) {
    return {
      ok: false,
      response: jsonResponse({ error: "Origin not allowed." }, { status: 403 }),
    };
  }

  return { ok: true, origin: allowedOrigin };
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

  return null;
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

  const providedToken = extractBearerToken(request.headers.get("Authorization"));
  if (!providedToken) {
    return {
      ok: false,
      response: jsonResponse(
        { error: "Missing bearer token." },
        { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
        corsOrigin
      ),
    };
  }

  if (!constantTimeEquals(providedToken, env.GPT_SHARED_SECRET)) {
    return {
      ok: false,
      response: jsonResponse(
        { error: "Invalid bearer token." },
        { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
        corsOrigin
      ),
    };
  }

  return { ok: true };
}

async function handlePost(request, env, corsOrigin) {
  if (!env.OPENAI_API_KEY) {
    return jsonResponse(
      { error: "Missing OpenAI API key." },
      { status: 500 },
      corsOrigin
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return jsonResponse({ error: "Invalid JSON body." }, { status: 400 }, corsOrigin);
  }

  const { role, content, name } = message;

  if (!Array.isArray(messages) && typeof prompt !== "string") {
    return jsonResponse(
      {
        error:
          "Request body must include either a 'messages' array or a 'prompt' string.",
      },
      { status: 400 },
      corsOrigin
    );
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
        { body: responseText },
        corsOrigin,
      return jsonResponse(
        {
          error: "Unexpected response from OpenAI API.",
          details: responseText,
        },
        { status: 502 },
        corsOrigin
      );
    }

    if (!response.ok) {
      return jsonResponse(
        {
          error: "OpenAI API request failed.",
          details: data,
        },
        { status: response.status },
        corsOrigin
      );
    }

    return jsonResponse(data, { status: response.status }, corsOrigin);
  } catch (error) {
    return jsonResponse(
      {
        error: "Failed to contact OpenAI API.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
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
