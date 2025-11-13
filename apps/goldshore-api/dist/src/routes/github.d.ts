import { type WebhookEnv } from "../webhook";
export declare function handleGithubWebhook(request: Request, env: WebhookEnv, ctx: ExecutionContext): Promise<Response>;
export declare function handleGithubCallback(): Promise<Response>;
