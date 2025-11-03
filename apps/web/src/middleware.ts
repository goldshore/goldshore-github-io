import { defineMiddleware } from "astro:middleware";

function randomBase64(bytesLength: number) {
  const bytes = new Uint8Array(bytesLength);
  const webCrypto = globalThis.crypto;
  if (!webCrypto || typeof webCrypto.getRandomValues !== "function") {
    throw new Error(
      "Secure random number generation is unavailable in this environment."
    );
  }

  webCrypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export const onRequest = defineMiddleware(async (context, next) => {
  const nonce = randomBase64(16);
  context.locals.nonce = nonce;

  const response = await next();
  const headers = new Headers(response.headers);

  let csp = headers.get("Content-Security-Policy") || "";
  csp = csp.replace(/%NONCE%/g, nonce);
  headers.set("Content-Security-Policy", csp);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});
