import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { verifyAccess } from "../src/auth/access";

const issuer = "https://issuer.example.com";
const audience = "test-audience";

let privateKey: CryptoKey;
let jwksJson: string;

beforeAll(async () => {
  const { privateKey: pk, publicKey } = await generateKeyPair("ES256");
  privateKey = pk;
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test-kid";
  jwksJson = JSON.stringify({ keys: [jwk] });
});

const buildRequest = (token: string) =>
  new Request("https://api.goldshore.org/ai/generate", {
    headers: { "cf-access-jwt-assertion": token }
  });

describe("verifyAccess", () => {
  it("accepts a valid Cloudflare Access token", async () => {
    const token = await new SignJWT({
      email: "user@example.com",
      scope: "admin"
    })
      .setProtectedHeader({ alg: "ES256", kid: "test-kid" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("2m")
      .sign(privateKey);

    const result = await verifyAccess(buildRequest(token), {
      ACCESS_ISSUER: issuer,
      ACCESS_AUDIENCE: audience,
      ACCESS_JWKS_JSON: jwksJson
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.email).toBe("user@example.com");
      expect(result.scopes).toContain("admin");
    }
  });

  it("rejects tampered tokens", async () => {
    const token = await new SignJWT({
      email: "user@example.com",
      scope: "admin"
    })
      .setProtectedHeader({ alg: "ES256", kid: "test-kid" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("2m")
      .sign(privateKey);

    const parts = token.split(".");
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    payload.email = "attacker@example.com";
    const tamperedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const tampered = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const result = await verifyAccess(buildRequest(tampered), {
      ACCESS_ISSUER: issuer,
      ACCESS_AUDIENCE: audience,
      ACCESS_JWKS_JSON: jwksJson
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.error).toBe("ACCESS_TOKEN_INVALID");
    }
  });
});
