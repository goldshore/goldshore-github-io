const TOKEN_HEADER_NAME = "x-api-key";
const BASE_CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-GPT-Proxy-Token, CF-Access-Jwt-Assertion",
};
const DEFAULT_ALLOWED_HEADERS = "Content-Type, Authorization";
const DEFAULT_ALLOWED_METHODS = "POST, OPTIONS";

const encoder = new TextEncoder();

function timingSafeEqual(a, b) {
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

function parseAllowedOrigins(env) {
  const rawOrigins = env.GPT_ALLOWED_ORIGINS || env.ALLOWED_ORIGINS || "";

  return rawOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function resolveAllowedOrigin(requestOrigin, allowedOrigins) {
  if (typeof requestOrigin !== "string") {
    return null;
  }

  const normalizedOrigin = requestOrigin.trim();
  if (normalizedOrigin === "") {
    return null;
  }

  if (!Array.isArray(allowedOrigins) || allowedOrigins.length === 0) {
    return null;
function buildCorsHeaders(origin) {
  const headers = new Headers();

  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }

  for (const allowed of allowedOrigins) {
    if (allowed === normalizedOrigin) {
      return normalizedOrigin;
    }
  }
  headers.set("Access-Control-Allow-Methods", DEFAULT_ALLOWED_METHODS);
  headers.set("Access-Control-Allow-Headers", DEFAULT_ALLOWED_HEADERS);

  return headers;
}

function jsonResponse(body, init = {}, origin = null) {
  const headers = new Headers(init.headers || {});
  const corsHeaders = buildCorsHeaders(origin);

  for (const [key, value] of corsHeaders.entries()) {
    headers.set(key, value);
  }

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

function validateOrigin(request, env) {
  const allowedOrigins = parseAllowedOrigins(env);

  if (allowedOrigins.length === 0) {
    return {
      errorResponse: jsonResponse(
        { error: "Server misconfigured: no allowed origins configured." },
        { status: 500 },
      ),
    };
  }

  const origin = request.headers.get("Origin");

  if (origin && !allowedOrigins.includes(origin)) {
    return {
      errorResponse: jsonResponse(
        { error: "Origin is not allowed." },
        { status: 403 },
      ),
    };
  }

  return { origin: origin && allowedOrigins.includes(origin) ? origin : null };
}

function authorizeRequest(request, env, origin) {
  const expectedToken = env.GPT_SERVICE_TOKEN;

  const expectedToken = env.GPT_PROXY_SECRET;
  if (!expectedToken) {
    return jsonResponse({ error: "Missing GPT proxy secret." }, { status: 500 }, allowedOrigin);
  if (!expectedToken) {
    return jsonResponse(
      { error: "Server misconfigured: missing GPT service token." },
      { status: 500 },
      origin,
    );
  }

  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;

  if (token !== expectedToken) {
    return jsonResponse(
      { error: "Unauthorized." },
      { status: 401 },
      origin,
    );
  }

  return null;
}

async function handlePost(request, env, origin) {
  if (!env.OPENAI_API_KEY) {
    return jsonResponse(
      { error: "Missing OpenAI API key." },
      { status: 500 },
      origin,
    );
  }

  if (!timingSafeEqual(providedToken, expectedToken)) {
    return jsonResponse({ error: "Invalid authentication token." }, { status: 403 }, allowedOrigin);
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
    return jsonResponse(
      { error: "Invalid JSON body." },
      { status: 400 },
      origin,
    );
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
    }, { status: 400 }, origin);
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
      }, { status: 502 }, origin);
    }

    if (!response.ok) {
      return jsonResponse(request, {
        error: "OpenAI API request failed.",
        details: data,
      }, { status: response.status }, origin);
    }

    return jsonResponse(data, { status: response.status }, origin);
  } catch (error) {
    return jsonResponse(request, {
      error: "Failed to contact OpenAI API.",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 502 }, origin);
  }
}

export default {
  async fetch(request, env) {
    const requestOriginHeader = request.headers.get("Origin");
    const allowedOrigins = parseAllowedOrigins(env);
    const allowedOrigin = resolveAllowedOrigin(requestOriginHeader, allowedOrigins);
    const hasAllowedOriginsConfigured = allowedOrigins.length > 0;
    const normalizedRequestOrigin =
      typeof requestOriginHeader === "string" ? requestOriginHeader.trim() : "";

    if (hasAllowedOriginsConfigured && normalizedRequestOrigin && !allowedOrigin) {
      return jsonResponse(
        { error: "Origin not allowed." },
        { status: 403 },
        normalizedRequestOrigin,
      );
    const { origin, errorResponse } = validateOrigin(request, env);

    if (errorResponse) {
      return errorResponse;
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(origin),
      });
    }

    if (request.method !== "POST") {
      return jsonResponse(
        { error: "Method not allowed." },
        { status: 405 },
        origin,
      );
    }

    const authError = authorizeRequest(request, env, origin);
    if (authError) {
      return authError;
    }

    return handlePost(request, env, origin);
  },
};
