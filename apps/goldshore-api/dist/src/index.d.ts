import type { WebhookEnv } from "./webhook";
export interface Env extends WebhookEnv {
}
interface JwtClaims {
    sub?: string;
    iss?: string;
    aud?: string | string[];
    exp?: number;
    nbf?: number;
    scope?: string;
    [key: string]: unknown;
}
interface EventQueueMessage {
    id: string;
    type: string;
    payload: Record<string, unknown>;
    subject?: string;
    issuedAt: number;
    metadata?: Record<string, unknown>;
}
export interface Env {
    KV_SESSIONS: KVNamespace;
    KV_CACHE: KVNamespace;
    DO_SESSIONS: DurableObjectNamespace;
    Q_EVENTS: Queue<EventQueueMessage>;
    GOLDSHORE_ENV: string;
    GOLDSHORE_ORIGIN?: string;
    GOLDSHORE_CORS?: string;
    GOLDSHORE_JWT_SECRET: string;
    JWT_AUDIENCE?: string;
    JWT_ISSUER?: string;
    RATE_LIMIT_MAX?: string;
    RATE_LIMIT_WINDOW?: string;
}
export declare function verifyJwt(token: string, env: Env): Promise<JwtClaims>;
interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    reset: number;
}
export declare function enforceRateLimit(identifier: string, env: Env): Promise<RateLimitResult>;
export declare function applyRateLimitHeaders(headers: Headers, result: RateLimitResult, limit: number): void;
declare const _default: {
    fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
    queue(batch: MessageBatch<EventQueueMessage>, env: Env): Promise<void>;
    scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void>;
};
export default _default;
export declare class SessionDO {
    private readonly state;
    constructor(state: DurableObjectState);
    fetch(request: Request): Promise<Response>;
}
