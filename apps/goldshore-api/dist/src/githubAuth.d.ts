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
export declare function createGitHubAppJWT(env: GitHubAuthEnv, now?: number): Promise<string>;
export declare function mintInstallationToken(env: GitHubAuthEnv, installationIdInput?: number | string): Promise<InstallationToken>;
