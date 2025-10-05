const DEFAULT_ALLOWED_HEADERS = "Content-Type, Authorization";
const DEFAULT_ALLOWED_METHODS = "POST, OPTIONS";

function parseAllowedOrigins(env) {
  const rawOrigins = env.GPT_ALLOWED_ORIGINS || env.ALLOWED_ORIGINS || "";

  return rawOrigins
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

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
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

  const { messages, prompt, ...rest } = payload || {};

  if (!Array.isArray(messages) && typeof prompt !== "string") {
    return jsonResponse({
      error: "Request body must include either a 'messages' array or a 'prompt' string.",
    }, { status: 400 }, origin);
  }

  const chatMessages = Array.isArray(messages)
    ? messages
    : [
        {
          role: "user",
          content: prompt,
        },
      ];

  const requestBody = {
    model: "gpt-4.1-mini",
    messages: chatMessages,
    ...rest,
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
      }, { status: 502 }, origin);
    }

    if (!response.ok) {
      return jsonResponse({
        error: "OpenAI API request failed.",
        details: data,
      }, { status: response.status }, origin);
    }

    return jsonResponse(data, { status: response.status }, origin);
  } catch (error) {
    return jsonResponse({
      error: "Failed to contact OpenAI API.",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 502 }, origin);
  }
}

export default {
  async fetch(request, env) {
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
