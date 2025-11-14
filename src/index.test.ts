import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { verifyAccessJwt, type Bindings } from './index';

describe('verifyAccessJwt', () => {
  let server: Server;
  let jwksUrl: string;
  let privateKey: CryptoKey;

  beforeAll(async () => {
    const { privateKey: privKey, publicKey } = await generateKeyPair('RS256');
    privateKey = privKey;
    const publicJwk = await exportJWK(publicKey);

    server = createServer((req, res) => {
      if (!req.url) {
        res.statusCode = 404;
        res.end();
        return;
      }

      if (req.url === '/jwks') {
        res.setHeader('content-type', 'application/json');
        res.write(
          JSON.stringify({
            keys: [
              {
                ...publicJwk,
                use: 'sig',
                kid: 'test-key',
                alg: 'RS256',
              },
            ],
          }),
        );
        res.end();
        return;
      }

      res.statusCode = 404;
      res.end();
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address() as AddressInfo;
    jwksUrl = `http://127.0.0.1:${address.port}/jwks`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  const baseEnv = (): Bindings => ({
    ACCESS_JWKS_URL: jwksUrl,
    ACCESS_ISSUER: 'https://access.example.com',
    ACCESS_AUDIENCE: 'goldshore-api',
    CORS_ORIGINS: 'http://localhost',
    ASSETS: {
      fetch: async () => new Response(''),
    },
  });

  const createToken = async (overrides: Record<string, unknown> = {}) => {
    const payload = {
      email: 'user@example.com',
      scope: ['reader', 'ops'],
      ...overrides,
    };

    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer('https://access.example.com')
      .setAudience('goldshore-api')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
  };

  it('accepts valid tokens and returns claims', async () => {
    const token = await createToken();
    const result = await verifyAccessJwt(token, baseEnv());

    expect(result.email).toBe('user@example.com');
    expect(new Set(result.scopes)).toEqual(new Set(['reader', 'ops']));
  });

  it('rejects tampered tokens', async () => {
    const token = await createToken();
    const tampered = `${token}tamper`;

    await expect(verifyAccessJwt(tampered, baseEnv())).rejects.toThrow();
  });
});
