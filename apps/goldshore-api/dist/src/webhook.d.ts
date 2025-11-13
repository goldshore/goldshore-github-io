import { type GitHubAuthEnv } from "./githubAuth";
export interface WebhookEnv extends GitHubAuthEnv {
    GITHUB_WEBHOOK_SECRET: string;
}
export declare function handleWebhook(request: Request, env: WebhookEnv, ctx: ExecutionContext): Promise<Response>;
