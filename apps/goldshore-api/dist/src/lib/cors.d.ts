export interface CorsEnv {
    GOLDSHORE_CORS?: string;
    GOLDSHORE_ORIGIN?: string;
}
export declare function allowOrigin(origin: string | null, env: CorsEnv): string;
export declare function corsHeaders(origin?: string): {
    "Access-Control-Allow-Origin": string;
    "Access-Control-Allow-Methods": string;
    "Access-Control-Allow-Headers": string;
    "Access-Control-Max-Age": string;
    Vary: string;
};
export declare function handleOptions(request: Request, env: CorsEnv): Response;
