export interface InstallationTokenResponse {
    token: string;
    expires_at: string;
    permissions?: Record<string, string>;
    repository_selection?: string;
}
export declare function createAppJwt(appId: string, pem: string, now?: number): Promise<string>;
export declare function getInstallationToken(appJwt: string, installationId: number | string): Promise<InstallationTokenResponse>;
