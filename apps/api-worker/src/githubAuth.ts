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

function pemToArrayBuffer(pem: string): ArrayBuffer {
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
  return bytes.buffer;
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

  const keyData = pemToArrayBuffer(GITHUB_APP_PRIVATE_KEY);
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
