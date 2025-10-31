import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
  const nonce = generateNonce();
  context.locals.nonce = nonce;

  const response = await next();
  const headers = new Headers(response.headers);

  let csp = headers.get("Content-Security-Policy") || "";
  csp = csp.replace(/%NONCE%/g, nonce);
  headers.set("Content-Security-Policy", csp);

  const contentType = headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    const html = await response.text();
    const withNonce = html.replace(/__CSP_NONCE__/g, nonce);
    return new Response(withNonce, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});

function generateNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}
