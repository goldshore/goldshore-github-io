const TOKEN_HEADER_NAME = "x-api-key";
const BASE_CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-GPT-Proxy-Token, CF-Access-Jwt-Assertion",
};
const DEFAULT_ALLOWED_HEADERS = "Content-Type, Authorization";
const DEFAULT_ALLOWED_METHODS = "POST, OPTIONS";
const DEFAULT_MODEL = "gpt-4o-mini";
const ALLOWED_CHAT_COMPLETION_OPTIONS = new Set([
  "frequency_penalty",
  "logit_bias",
  "logprobs",
  "top_logprobs",
  "max_tokens",
  "n",
  "presence_penalty",
  "response_format",
  "seed",
  "stop",
  "stream",
  "temperature",
  "top_p",
  "user",
]);

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
  const raw = env.GPT_ALLOWED_ORIGINS ?? env.ALLOWED_ORIGINS ?? "";
  return raw
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

  if (!Array.isArray(allowedOrigins) || allowedOrigins.length === 0) {
    return null;
  }

  if (allowedOrigins.includes("*")) {
    return normalizedOrigin;
  }

  for (const allowed of allowedOrigins) {
    if (allowed === normalizedOrigin) {
      return normalizedOrigin;
    }
  }

  return null;
}

function buildCorsHeaders(origin) {
  const headers = new Headers(BASE_CORS_HEADERS);

  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }

  headers.set("Access-Control-Allow-Methods", DEFAULT_ALLOWED_METHODS);
  headers.set("Access-Control-Allow-Headers", DEFAULT_ALLOWED_HEADERS);

  return headers;
}

function jsonResponse(body, init = {}, origin = null) {
  const headers = new Headers(BASE_CORS_HEADERS);

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

function authorizeRequest(request, env, origin) {
  const expectedToken = env.GPT_SERVICE_TOKEN;

  if (!expectedToken) {
    return errorResponse(
      "Server misconfigured: missing GPT service token.",
      500,
      undefined,
      origin,
    );
  }

  const authHeader = request.headers.get("Authorization") || "";
  let providedToken = null;

  if (authHeader.toLowerCase().startsWith("bearer ")) {
    providedToken = authHeader.slice("Bearer ".length).trim();
  }

  if (!providedToken) {
    const headerToken = request.headers.get(TOKEN_HEADER_NAME);
    if (typeof headerToken === "string" && headerToken.trim() !== "") {
      providedToken = headerToken.trim();
    }
  }

  if (!providedToken) {
    return errorResponse("Missing authentication token.", 401, undefined, origin);
  }

  if (!timingSafeEqual(providedToken, expectedToken)) {
    return errorResponse("Unauthorized.", 401, undefined, origin);
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

  const { model = DEFAULT_MODEL, messages, prompt, ...rest } = payload;

  if (!Array.isArray(messages) && typeof prompt !== "string") {
    throw new Error("Request body must include either a 'messages' array or a 'prompt' string.");
  }

  if (typeof model !== "string" || model.trim() === "") {
    throw new Error("Model must be a non-empty string.");
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
    if (value !== undefined && ALLOWED_CHAT_COMPLETION_OPTIONS.has(key)) {
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
    } catch (parseError) {
      return errorResponse("Unexpected response from OpenAI API.", 502, text, origin);
    }

    if (!response.ok) {
      return errorResponse("OpenAI API request failed.", response.status, data, origin);
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
    const allowedOrigins = parseAllowedOrigins(env);

    if (allowedOrigins.length === 0) {
      return errorResponse(
        "Server misconfigured: no allowed origins configured.",
        500,
      );
    }

    const requestOrigin = request.headers.get("Origin");
    const allowedOrigin = resolveAllowedOrigin(requestOrigin, allowedOrigins);

    if (requestOrigin && !allowedOrigin) {
      return errorResponse("Origin is not allowed.", 403, undefined, requestOrigin);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(allowedOrigin),
      });
    }

    if (request.method !== "POST") {
      return errorResponse("Method not allowed.", 405, undefined, allowedOrigin);
    }

    const authError = authorizeRequest(request, env, allowedOrigin);
    if (authError) {
      return authError;
    }

    return handlePost(request, env, allowedOrigin);
  },
};
