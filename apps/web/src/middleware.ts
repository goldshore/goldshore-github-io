import { defineMiddleware } from "astro:middleware";
import { randomBytes } from "node:crypto";

export const onRequest = defineMiddleware(async (context, next) => {
  const nonce = randomBytes(16).toString("base64");
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
