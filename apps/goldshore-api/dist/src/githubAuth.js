import { createAppJwt, getInstallationToken } from "./github/app-auth";
function resolvePrivateKey(env) {
    const key = env.GITHUB_APP_PRIVATE_KEY ?? env.GITHUB_PRIVATE_KEY ?? "";
    if (!key) {
        throw new Error("Missing GITHUB_APP_PRIVATE_KEY environment variable");
    }
    return key;
}
export async function createGitHubAppJWT(env, now = Math.floor(Date.now() / 1000)) {
    const { GITHUB_APP_ID } = env;
    if (!GITHUB_APP_ID) {
        throw new Error("Missing GITHUB_APP_ID environment variable");
    }
    const privateKey = resolvePrivateKey(env);
    return createAppJwt(GITHUB_APP_ID, privateKey, now);
}
export async function mintInstallationToken(env, installationIdInput) {
    const installationId = installationIdInput ?? env.GITHUB_APP_INSTALLATION_ID;
    if (!installationId) {
        throw new Error("Missing GitHub App installation id");
    }
    const jwt = await createGitHubAppJWT(env);
    const response = await getInstallationToken(jwt, installationId);
    return {
        token: response.token,
        expiresAt: response.expires_at,
        permissions: response.permissions,
        repositorySelection: response.repository_selection
    };
}
