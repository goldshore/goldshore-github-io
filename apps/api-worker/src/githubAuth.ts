export interface GitHubAuthEnv {
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_APP_INSTALLATION_ID?: string;
}

export interface InstallationToken {
  token: string;
  expiresAt: string;
  permissions?: Record<string, string>;
  repositorySelection?: string;
}

const encoder = new TextEncoder();

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncodeJson(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  return base64UrlEncodeBytes(encoder.encode(json));
}

function encodeAsn1Length(length: number): number[] {
  if (length < 0x80) {
    return [length];
  }

  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>= 8;
  }
  return [0x80 | bytes.length, ...bytes];
}

function convertPkcs1ToPkcs8(pkcs1Buffer: ArrayBuffer): ArrayBuffer {
  const pkcs1Bytes = new Uint8Array(pkcs1Buffer);

  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const algorithmIdentifier = new Uint8Array([
    0x30, 0x0d, // SEQUENCE length 13
    0x06, 0x09, // OBJECT IDENTIFIER length 9
    0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, // 1.2.840.113549.1.1.1 (rsaEncryption)
    0x05, 0x00 // NULL parameters
  ]);

  const privateKeyLengthBytes = encodeAsn1Length(pkcs1Bytes.length);
  const privateKey = new Uint8Array(1 + privateKeyLengthBytes.length + pkcs1Bytes.length);
  privateKey[0] = 0x04; // OCTET STRING tag
  privateKey.set(privateKeyLengthBytes, 1);
  privateKey.set(pkcs1Bytes, 1 + privateKeyLengthBytes.length);

  const bodyLength =
    version.length + algorithmIdentifier.length + privateKey.length;
  const bodyLengthBytes = encodeAsn1Length(bodyLength);

  const output = new Uint8Array(1 + bodyLengthBytes.length + bodyLength);
  output[0] = 0x30; // SEQUENCE tag
  output.set(bodyLengthBytes, 1);

  let offset = 1 + bodyLengthBytes.length;
  output.set(version, offset);
  offset += version.length;
  output.set(algorithmIdentifier, offset);
  offset += algorithmIdentifier.length;
  output.set(privateKey, offset);

  return output.buffer;
}

function pemToPkcs8ArrayBuffer(pem: string): ArrayBuffer {
  const headerMatch = /-----BEGIN ([^-]+)-----/.exec(pem);
  const footerMatch = /-----END ([^-]+)-----/.exec(pem);

  if (!headerMatch || !footerMatch || headerMatch[1] !== footerMatch[1]) {
    throw new Error("GitHub App private key is missing or malformed");
  }

  const type = headerMatch[1].trim();
  const normalized = pem
    .replace(/-----BEGIN[^-]+-----/g, "")
    .replace(/-----END[^-]+-----/g, "")
    .replace(/\s+/g, "")
    .trim();

  if (!normalized) {
    throw new Error("GitHub App private key is missing or malformed");
  }

  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  if (type === "PRIVATE KEY") {
    return bytes.buffer;
  }

  if (type === "RSA PRIVATE KEY") {
    return convertPkcs1ToPkcs8(bytes.buffer);
  }

  throw new Error(`Unsupported private key format: ${type}`);
}

export async function createGitHubAppJWT(env: GitHubAuthEnv, now: number = Math.floor(Date.now() / 1000)) {
  const { GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY } = env;
  if (!GITHUB_APP_ID) {
    throw new Error("Missing GITHUB_APP_ID environment variable");
  }
  if (!GITHUB_APP_PRIVATE_KEY) {
    throw new Error("Missing GITHUB_APP_PRIVATE_KEY environment variable");
  }

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: now - 60,
    exp: now + 600,
    iss: GITHUB_APP_ID
  };

  const headerEncoded = base64UrlEncodeJson(header);
  const payloadEncoded = base64UrlEncodeJson(payload);
  const unsignedToken = `${headerEncoded}.${payloadEncoded}`;

  const keyData = pemToPkcs8ArrayBuffer(GITHUB_APP_PRIVATE_KEY);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(unsignedToken)
  );

  const signature = base64UrlEncodeBytes(new Uint8Array(signatureBuffer));
  return `${unsignedToken}.${signature}`;
}

export async function mintInstallationToken(
  env: GitHubAuthEnv,
  installationIdInput?: number | string
): Promise<InstallationToken> {
  const installationId = installationIdInput ?? env.GITHUB_APP_INSTALLATION_ID;
  if (!installationId) {
    throw new Error("Missing GitHub App installation id");
  }

  const jwt = await createGitHubAppJWT(env);
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "goldshore-api-worker"
      }
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Failed to mint installation token (status ${response.status}): ${message}`
    );
  }

  const data = (await response.json()) as {
    token: string;
    expires_at: string;
    permissions?: Record<string, string>;
    repository_selection?: string;
  };
  return {
    token: data.token,
    expiresAt: data.expires_at,
    permissions: data.permissions,
    repositorySelection: data.repository_selection
  };
}
