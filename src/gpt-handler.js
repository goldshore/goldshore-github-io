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
  headers.set("content-type", "application/json");

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
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

  if (!allowedOrigins.includes(requestOrigin)) {
    return {
      ok: false,
      response: jsonResponse({ error: "Origin not allowed." }, { status: 403 }),
    };
  }

  return { ok: true, origin: requestOrigin };
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

  const {
    messages,
    prompt,
    model,
    purpose: rawPurpose = DEFAULT_PURPOSE,
    temperature,
    ...rest
  } = payload || {};

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
