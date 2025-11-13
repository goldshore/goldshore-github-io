function parseAllowedOrigins(env) {
    const values = [];
    if (env.GOLDSHORE_CORS) {
        for (const entry of env.GOLDSHORE_CORS.split(",")) {
            const trimmed = entry.trim();
            if (trimmed) {
                values.push(trimmed);
            }
        }
    }
    if (values.length === 0 && env.GOLDSHORE_ORIGIN) {
        values.push(env.GOLDSHORE_ORIGIN);
    }
    return values.length > 0 ? values : ["*"];
}
export function allowOrigin(origin, env) {
    const allowed = parseAllowedOrigins(env);
    if (allowed.includes("*")) {
        return "*";
    }
    if (origin && allowed.includes(origin)) {
        return origin;
    }
    return allowed[0] ?? "*";
}
export function corsHeaders(origin = "*") {
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Requested-With",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin"
    };
}
export function handleOptions(request, env) {
    const origin = allowOrigin(request.headers.get("Origin"), env);
    const headers = corsHeaders(origin);
    return new Response(null, { status: 204, headers });
}
