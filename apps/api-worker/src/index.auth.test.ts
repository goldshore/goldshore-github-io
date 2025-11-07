/// <reference types="@cloudflare/workers-types" />

import { describe, it, expect } from "vitest";
import { Env } from "./index";

import { verifyJwt } from "./index";

const SECRET = "test-secret";
const ISSUER = "test-issuer";
const AUDIENCE = "test-audience";

const mockEnv = {
  GOLDSHORE_JWT_SECRET: SECRET,
  JWT_ISSUER: ISSUER,
  JWT_AUDIENCE: AUDIENCE
} as unknown as Env;

const encoder = new TextEncoder();

function toBase64Url(data: string | Uint8Array): string {
  const str = typeof data === "string" ? data : String.fromCharCode(...data);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function createJwt(payload: Record<string, any>, secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const headerSegment = toBase64Url(JSON.stringify(header));
  const payloadSegment = toBase64Url(JSON.stringify(payload));

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${headerSegment}.${payloadSegment}`)
  );
  const signatureSegment = toBase64Url(new Uint8Array(signature));

  return `${headerSegment}.${payloadSegment}.${signatureSegment}`;
}

describe("verifyJwt", () => {
  it("should verify a valid JWT", async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: "user-123",
      iss: ISSUER,
      aud: AUDIENCE,
      exp: now + 3600,
      nbf: now - 1
    };
    const token = await createJwt(payload, SECRET);
    const claims = await verifyJwt(token, mockEnv);
    expect(claims.sub).toBe("user-123");
  });

  it("should throw for an invalid signature", async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: "user-123",
      iss: ISSUER,
      aud: AUDIENCE,
      exp: now + 3600
    };
    const token = await createJwt(payload, "wrong-secret");
    await expect(verifyJwt(token, mockEnv)).rejects.toThrow("Invalid signature");
  });

  it("should throw for an expired token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: "user-123",
      iss: ISSUER,
      aud: AUDIENCE,
      exp: now - 1
    };
    const token = await createJwt(payload, SECRET);
    await expect(verifyJwt(token, mockEnv)).rejects.toThrow("Token expired");
  });

  it("should throw for a token that is not yet valid", async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: "user-123",
      iss: ISSUER,
      aud: AUDIENCE,
      nbf: now + 3600
    };
    const token = await createJwt(payload, SECRET);
    await expect(verifyJwt(token, mockEnv)).rejects.toThrow("Token not yet valid");
  });

  it("should throw for an incorrect issuer", async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: "user-123",
      iss: "wrong-issuer",
      aud: AUDIENCE,
      exp: now + 3600
    };
    const token = await createJwt(payload, SECRET);
    await expect(verifyJwt(token, mockEnv)).rejects.toThrow("Unexpected issuer");
  });

  it("should throw for an incorrect audience", async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: "user-123",
      iss: ISSUER,
      aud: "wrong-audience",
      exp: now + 3600
    };
    const token = await createJwt(payload, SECRET);
    await expect(verifyJwt(token, mockEnv)).rejects.toThrow("Unexpected audience");
  });

  it("should throw for a malformed JWT", async () => {
    const token = "a.b";
    await expect(verifyJwt(token, mockEnv)).rejects.toThrow("Malformed JWT");
  });
});
