const BASE_CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-GPT-Proxy-Token, X-API-Key, CF-Access-Jwt-Assertion",
};

const encoder = new TextEncoder();

const DEFAULT_MODEL = "gpt-3.5-turbo";

const ALLOWED_CHAT_COMPLETION_OPTIONS = new Set([
  "frequency_penalty",
  "logit_bias",
  "max_tokens",
  "n",
  "presence_penalty",
  "stop",
  "temperature",
  "top_p",
  "user",
]);

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
    .map((value) => value.trim())
    .filter((value) => value !== "");
}

function resolveAllowedOrigin(requestOrigin, allowedOrigins) {
  if (typeof requestOrigin !== "string") {
    return null;
  }

  const normalizedOrigin = requestOrigin.trim();
  if (normalizedOrigin === "" || !Array.isArray(allowedOrigins)) {
    return null;
  }

  for (const allowed of allowedOrigins) {
    if (allowed === "*") {
      return "*";
    }

    if (allowed === normalizedOrigin) {
      return normalizedOrigin;
    }
  }

  return null;
}

function buildCorsHeaders(origin) {
  const headers = new Headers(BASE_CORS_HEADERS);

  if (origin === "*") {
    headers.set("Access-Control-Allow-Origin", "*");
  } else if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  } else {
    headers.set("Vary", "Origin");
  }

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

function validateOrigin(request, env) {
  const allowedOrigins = parseAllowedOrigins(env);

  if (allowedOrigins.length === 0) {
    return {
      errorResponse: errorResponse(
        "Server misconfigured: no allowed origins configured.",
        500,
      ),
    };
  }

  const requestOrigin = request.headers.get("Origin");

  if (!requestOrigin) {
    return { origin: null };
  }

  const resolved = resolveAllowedOrigin(requestOrigin, allowedOrigins);
  if (!resolved) {
    return {
      errorResponse: errorResponse(
        "Origin is not allowed.",
        403,
        undefined,
      ),
    };
  }

  return { origin: resolved };
}

function readClientToken(request) {
  const authHeader = request.headers.get("Authorization");
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    if (token !== "") {
      return token;
    }
  }

  const proxyToken = request.headers.get("X-GPT-Proxy-Token");
  if (typeof proxyToken === "string" && proxyToken.trim() !== "") {
    return proxyToken.trim();
  }

  const apiKey = request.headers.get("X-API-Key");
  if (typeof apiKey === "string" && apiKey.trim() !== "") {
    return apiKey.trim();
  }

  return "";
}

function resolveExpectedToken(env) {
  const candidates = [
    env.GPT_SERVICE_TOKEN,
    env.GPT_PROXY_TOKEN,
    env.GPT_PROXY_SECRET,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() !== "") {
      return candidate.trim();
    }
  }

  return null;
}

function authorizeRequest(request, env, origin) {
  const expectedToken = resolveExpectedToken(env);

  if (!expectedToken) {
    return errorResponse(
      "Server misconfigured: missing GPT service token.",
      500,
      undefined,
      origin,
    );
  }

  const providedToken = readClientToken(request);

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
  const hasMessages = Array.isArray(messages);

  if (!hasMessages && typeof prompt !== "string") {
    throw new Error("Request body must include either a 'messages' array or a 'prompt' string.");
  }

  const normalizedMessages = (hasMessages
    ? messages
    : [
        {
          role: "user",
          content: prompt,
        },
      ]
  ).map((message, index) => normalizeMessage(message, index));

  const trimmedModel = typeof model === "string" && model.trim() !== "" ? model.trim() : DEFAULT_MODEL;

  const requestBody = {
    model: trimmedModel,
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
    const { origin, errorResponse: originError } = validateOrigin(request, env);

    if (originError) {
      return originError;
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(origin),
      });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, { status: 405 }, origin);
    }

    const authError = authorizeRequest(request, env, origin);
    if (authError) {
      return authError;
    }

    return handlePost(request, env, origin);
  },
};

