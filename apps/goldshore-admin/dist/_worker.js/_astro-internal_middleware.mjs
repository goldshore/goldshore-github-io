globalThis.process ??= {}; globalThis.process.env ??= {};
import { d as defineMiddleware, s as sequence } from './chunks/index_DZWpewIK.mjs';
import './chunks/astro-designed-error-pages_D2b4fFaf.mjs';

function randomBase64(bytesLength) {
  const bytes = new Uint8Array(bytesLength);
  const webCrypto = typeof globalThis === "object" ? globalThis.crypto : void 0;
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
const onRequest$2 = defineMiddleware(async (context, next) => {
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
    headers
  });
});

const When = {
			Client: 'client',
			Server: 'server',
			Prerender: 'prerender',
			StaticBuild: 'staticBuild',
			DevServer: 'devServer',
		};

              const isBuildContext = Symbol.for('astro:when/buildContext');
              const whenAmI = globalThis[isBuildContext] ? When.Prerender : When.Server;

const middlewares = {
  [When.Client]: () => {
    throw new Error("Client should not run a middleware!");
  },
  [When.DevServer]: (_, next) => next(),
  [When.Server]: (_, next) => next(),
  [When.Prerender]: (ctx, next) => {
    if (ctx.locals.runtime === void 0) {
      ctx.locals.runtime = {
        env: process.env
      };
    }
    return next();
  },
  [When.StaticBuild]: (_, next) => next()
};
const onRequest$1 = middlewares[whenAmI];

const onRequest = sequence(
	onRequest$1,
	onRequest$2

);

export { onRequest };
