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
        headers: withCorsHeaders(origin),
      });
    }

    if (request.method !== "POST") {
      return errorResponse("Method not allowed.", 405, undefined, origin);
    }

    const authResult = validateAuthorization(request, env);
    if (!authResult.ok) {
      return errorResponse(authResult.message, authResult.status, undefined, origin);
    }

    return handlePost(request, env, origin);
  },
};
