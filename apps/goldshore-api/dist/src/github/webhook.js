const encoder = new TextEncoder();
function timingSafeEqual(expected, actual) {
    if (expected.length !== actual.length) {
        return false;
    }
    let mismatch = 0;
    for (let i = 0; i < expected.length; i += 1) {
        mismatch |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
    }
    return mismatch === 0;
}
function toHex(bytes) {
    const view = new Uint8Array(bytes);
    let output = "";
    for (const value of view) {
        output += value.toString(16).padStart(2, "0");
    }
    return output;
}
export async function verifyGitHubWebhook(payload, signature256, secret) {
    if (!secret) {
        throw new Error("Missing GITHUB_WEBHOOK_SECRET environment variable");
    }
    if (!signature256 || !signature256.startsWith("sha256=")) {
        return false;
    }
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    const expected = `sha256=${toHex(digest)}`;
    return timingSafeEqual(expected, signature256);
}
