import { createAppJwt, getInstallationToken, type InstallationTokenResponse } from "./github/app-auth";

export interface GitHubAuthEnv {
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  GITHUB_PRIVATE_KEY?: string;
  GITHUB_APP_INSTALLATION_ID?: string;
}

export interface InstallationToken {
  token: string;
  expiresAt: string;
  permissions?: Record<string, string>;
  repositorySelection?: string;
}

function resolvePrivateKey(env: GitHubAuthEnv): string {
  const key = env.GITHUB_APP_PRIVATE_KEY ?? env.GITHUB_PRIVATE_KEY ?? "";
  if (!key) {
    throw new Error("Missing GITHUB_APP_PRIVATE_KEY environment variable");
  }
  return key;
}

export async function createGitHubAppJWT(
  env: GitHubAuthEnv,
  now: number = Math.floor(Date.now() / 1000)
) {
  const { GITHUB_APP_ID } = env;
  if (!GITHUB_APP_ID) {
    throw new Error("Missing GITHUB_APP_ID environment variable");
  }
  const privateKey = resolvePrivateKey(env);
  return createAppJwt(GITHUB_APP_ID, privateKey, now);
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
  const response: InstallationTokenResponse = await getInstallationToken(jwt, installationId);
  return {
    token: response.token,
    expiresAt: response.expires_at,
    permissions: response.permissions,
    repositorySelection: response.repository_selection
  };
}
