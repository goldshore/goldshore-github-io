import { createLocalJWKSet, createRemoteJWKSet, jwtVerify, type JWKSet, type JWTPayload } from "jose";

export interface AccessGrant {
  ok: true;
  email: string;
  scopes: string[];
  payload: JWTPayload;
  token: string;
}

export interface AccessDeny {
  ok: false;
  status: number;
  error: string;
}

export type AccessVerification = AccessGrant | AccessDeny;

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const inlineJwksCache = new Map<string, ReturnType<typeof createLocalJWKSet>>();

const getRemoteJwks = (url: string) => {
  if (!jwksCache.has(url)) {
    jwksCache.set(url, createRemoteJWKSet(new URL(url)));
  }
  return jwksCache.get(url)!;
};

const getInlineJwks = (json: string) => {
  if (!inlineJwksCache.has(json)) {
    const parsed = JSON.parse(json) as JWKSet;
    inlineJwksCache.set(json, createLocalJWKSet(parsed));
  }
  return inlineJwksCache.get(json)!;
};

const extractScopes = (payload: JWTPayload): string[] => {
  const raw = payload.scope ?? payload.scopes ?? payload.roles ?? payload.permissions;
  if (Array.isArray(raw)) {
    return raw.map(value => value?.toString?.() ?? "").filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw.split(/[\s,]+/).map(scope => scope.trim()).filter(Boolean);
  }
  return [];
};

export async function verifyAccess(req: Request, env: Record<string, any>): Promise<AccessVerification> {
  const assertion = req.headers.get("cf-access-jwt-assertion") || req.headers.get("Cf-Access-Jwt-Assertion");
  if (!assertion) {
    return { ok: false, status: 401, error: "ACCESS_TOKEN_MISSING" };
  }

  const issuer = env.ACCESS_ISSUER as string | undefined;
  const jwksUrl = env.ACCESS_JWKS_URL as string | undefined;
  const inlineJwks = env.ACCESS_JWKS_JSON as string | undefined;
  const audienceRaw = env.ACCESS_AUDIENCE as string | undefined;

  if (!issuer || (!jwksUrl && !inlineJwks)) {
    return { ok: false, status: 500, error: "ACCESS_CONFIGURATION_MISSING" };
  }

  try {
    const jwks = inlineJwks ? getInlineJwks(inlineJwks) : getRemoteJwks(jwksUrl!);
    const audience = audienceRaw
      ? audienceRaw.split(",").map(part => part.trim()).filter(Boolean)
      : undefined;
    const { payload } = await jwtVerify(assertion, jwks, {
      issuer,
      audience
    });
    const email = typeof payload.email === "string" ? payload.email : undefined;
    if (!email) {
      return { ok: false, status: 403, error: "ACCESS_EMAIL_MISSING" };
    }
    const scopes = extractScopes(payload);
    return { ok: true, email, scopes, payload, token: assertion };
  } catch (error) {
    console.error("Access token verification failed", error);
    return { ok: false, status: 401, error: "ACCESS_TOKEN_INVALID" };
  }
}
