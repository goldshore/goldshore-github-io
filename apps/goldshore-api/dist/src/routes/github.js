import { handleWebhook } from "../webhook";
export async function handleGithubWebhook(request, env, ctx) {
    return handleWebhook(request, env, ctx);
}
export async function handleGithubCallback() {
    return new Response("oauth ok", { status: 200, headers: { "content-type": "text/plain" } });
}
