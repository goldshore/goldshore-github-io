globalThis.process ??= {}; globalThis.process.env ??= {};
import { g as decodeKey } from './chunks/astro/server_Bbdr8WX7.mjs';
import './chunks/astro-designed-error-pages_hZdTse4d.mjs';
import { N as NOOP_MIDDLEWARE_FN } from './chunks/noop-middleware_BG_dj3Bx.mjs';

function sanitizeParams(params) {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => {
      if (typeof value === "string") {
        return [key, value.normalize().replace(/#/g, "%23").replace(/\?/g, "%3F")];
      }
      return [key, value];
    })
  );
}
function getParameter(part, params) {
  if (part.spread) {
    return params[part.content.slice(3)] || "";
  }
  if (part.dynamic) {
    if (!params[part.content]) {
      throw new TypeError(`Missing parameter: ${part.content}`);
    }
    return params[part.content];
  }
  return part.content.normalize().replace(/\?/g, "%3F").replace(/#/g, "%23").replace(/%5B/g, "[").replace(/%5D/g, "]");
}
function getSegment(segment, params) {
  const segmentPath = segment.map((part) => getParameter(part, params)).join("");
  return segmentPath ? "/" + segmentPath : "";
}
function getRouteGenerator(segments, addTrailingSlash) {
  return (params) => {
    const sanitizedParams = sanitizeParams(params);
    let trailing = "";
    if (addTrailingSlash === "always" && segments.length) {
      trailing = "/";
    }
    const path = segments.map((segment) => getSegment(segment, sanitizedParams)).join("") + trailing;
    return path || "/";
  };
}

function deserializeRouteData(rawRouteData) {
  return {
    route: rawRouteData.route,
    type: rawRouteData.type,
    pattern: new RegExp(rawRouteData.pattern),
    params: rawRouteData.params,
    component: rawRouteData.component,
    generate: getRouteGenerator(rawRouteData.segments, rawRouteData._meta.trailingSlash),
    pathname: rawRouteData.pathname || void 0,
    segments: rawRouteData.segments,
    prerender: rawRouteData.prerender,
    redirect: rawRouteData.redirect,
    redirectRoute: rawRouteData.redirectRoute ? deserializeRouteData(rawRouteData.redirectRoute) : void 0,
    fallbackRoutes: rawRouteData.fallbackRoutes.map((fallback) => {
      return deserializeRouteData(fallback);
    }),
    isIndex: rawRouteData.isIndex
  };
}

function deserializeManifest(serializedManifest) {
  const routes = [];
  for (const serializedRoute of serializedManifest.routes) {
    routes.push({
      ...serializedRoute,
      routeData: deserializeRouteData(serializedRoute.routeData)
    });
    const route = serializedRoute;
    route.routeData = deserializeRouteData(serializedRoute.routeData);
  }
  const assets = new Set(serializedManifest.assets);
  const componentMetadata = new Map(serializedManifest.componentMetadata);
  const inlinedScripts = new Map(serializedManifest.inlinedScripts);
  const clientDirectives = new Map(serializedManifest.clientDirectives);
  const serverIslandNameMap = new Map(serializedManifest.serverIslandNameMap);
  const key = decodeKey(serializedManifest.key);
  return {
    // in case user middleware exists, this no-op middleware will be reassigned (see plugin-ssr.ts)
    middleware() {
      return { onRequest: NOOP_MIDDLEWARE_FN };
    },
    ...serializedManifest,
    assets,
    componentMetadata,
    inlinedScripts,
    clientDirectives,
    routes,
    serverIslandNameMap,
    key
  };
}

const manifest = deserializeManifest({"hrefRoot":"file:///app/apps/goldshore-web/","adapterName":"@astrojs/cloudflare","routes":[{"file":"","links":[],"scripts":[{"type":"external","value":"/_astro/page.DOVBwqVB.js"}],"styles":[],"routeData":{"type":"endpoint","isIndex":false,"route":"/_image","pattern":"^\\/_image$","segments":[[{"content":"_image","dynamic":false,"spread":false}]],"params":[],"component":"../../node_modules/.pnpm/astro@4.16.19_@types+node@24.10.1_rollup@4.53.2_typescript@5.9.3/node_modules/astro/dist/assets/endpoint/generic.js","pathname":"/_image","prerender":false,"fallbackRoutes":[],"_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[{"type":"external","value":"/_astro/page.DOVBwqVB.js"}],"styles":[{"type":"external","src":"/_astro/about.zfoVTkO3.css"}],"routeData":{"route":"/about","isIndex":false,"type":"page","pattern":"^\\/about\\/?$","segments":[[{"content":"about","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/about.astro","pathname":"/about","prerender":false,"fallbackRoutes":[],"_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[{"type":"external","value":"/_astro/page.DOVBwqVB.js"}],"styles":[{"type":"external","src":"/_astro/about.zfoVTkO3.css"}],"routeData":{"route":"/admin","isIndex":true,"type":"page","pattern":"^\\/admin\\/?$","segments":[[{"content":"admin","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/admin/index.astro","pathname":"/admin","prerender":false,"fallbackRoutes":[],"_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[{"type":"external","value":"/_astro/page.DOVBwqVB.js"}],"styles":[{"type":"external","src":"/_astro/about.zfoVTkO3.css"}],"routeData":{"route":"/blog","isIndex":true,"type":"page","pattern":"^\\/blog\\/?$","segments":[[{"content":"blog","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/blog/index.astro","pathname":"/blog","prerender":false,"fallbackRoutes":[],"_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[{"type":"external","value":"/_astro/page.DOVBwqVB.js"}],"styles":[{"type":"external","src":"/_astro/about.zfoVTkO3.css"},{"type":"external","src":"/_astro/contact.CiTv11fd.css"}],"routeData":{"route":"/contact","isIndex":false,"type":"page","pattern":"^\\/contact\\/?$","segments":[[{"content":"contact","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/contact.astro","pathname":"/contact","prerender":false,"fallbackRoutes":[],"_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[{"type":"external","value":"/_astro/page.DOVBwqVB.js"}],"styles":[{"type":"external","src":"/_astro/about.zfoVTkO3.css"}],"routeData":{"route":"/dash","isIndex":false,"type":"page","pattern":"^\\/dash\\/?$","segments":[[{"content":"dash","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/dash.astro","pathname":"/dash","prerender":false,"fallbackRoutes":[],"_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[{"type":"external","value":"/_astro/page.DOVBwqVB.js"}],"styles":[{"type":"external","src":"/_astro/about.zfoVTkO3.css"}],"routeData":{"route":"/privacy","isIndex":false,"type":"page","pattern":"^\\/privacy\\/?$","segments":[[{"content":"privacy","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/privacy.astro","pathname":"/privacy","prerender":false,"fallbackRoutes":[],"_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[{"type":"external","value":"/_astro/page.DOVBwqVB.js"}],"styles":[{"type":"external","src":"/_astro/about.zfoVTkO3.css"}],"routeData":{"route":"/services/banproof","isIndex":false,"type":"page","pattern":"^\\/services\\/banproof\\/?$","segments":[[{"content":"services","dynamic":false,"spread":false}],[{"content":"banproof","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/services/banproof.astro","pathname":"/services/banproof","prerender":false,"fallbackRoutes":[],"_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[{"type":"external","value":"/_astro/page.DOVBwqVB.js"}],"styles":[{"type":"external","src":"/_astro/about.zfoVTkO3.css"}],"routeData":{"route":"/services/bridgekeeper","isIndex":false,"type":"page","pattern":"^\\/services\\/bridgekeeper\\/?$","segments":[[{"content":"services","dynamic":false,"spread":false}],[{"content":"bridgekeeper","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/services/bridgekeeper.astro","pathname":"/services/bridgekeeper","prerender":false,"fallbackRoutes":[],"_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[{"type":"external","value":"/_astro/page.DOVBwqVB.js"}],"styles":[{"type":"external","src":"/_astro/about.zfoVTkO3.css"}],"routeData":{"route":"/services","isIndex":true,"type":"page","pattern":"^\\/services\\/?$","segments":[[{"content":"services","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/services/index.astro","pathname":"/services","prerender":false,"fallbackRoutes":[],"_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[{"type":"external","value":"/_astro/page.DOVBwqVB.js"}],"styles":[{"type":"external","src":"/_astro/about.zfoVTkO3.css"}],"routeData":{"route":"/team","isIndex":false,"type":"page","pattern":"^\\/team\\/?$","segments":[[{"content":"team","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/team.astro","pathname":"/team","prerender":false,"fallbackRoutes":[],"_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[{"type":"external","value":"/_astro/page.DOVBwqVB.js"}],"styles":[{"type":"external","src":"/_astro/about.zfoVTkO3.css"}],"routeData":{"route":"/terms","isIndex":false,"type":"page","pattern":"^\\/terms\\/?$","segments":[[{"content":"terms","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/terms.astro","pathname":"/terms","prerender":false,"fallbackRoutes":[],"_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[{"type":"external","value":"/_astro/page.DOVBwqVB.js"}],"styles":[{"type":"external","src":"/_astro/about.zfoVTkO3.css"}],"routeData":{"route":"/","isIndex":true,"type":"page","pattern":"^\\/$","segments":[],"params":[],"component":"src/pages/index.astro","pathname":"/","prerender":false,"fallbackRoutes":[],"_meta":{"trailingSlash":"ignore"}}}],"base":"/","trailingSlash":"ignore","compressHTML":true,"componentMetadata":[["/app/apps/goldshore-web/src/pages/about.astro",{"propagation":"none","containsHead":true}],["/app/apps/goldshore-web/src/pages/admin/index.astro",{"propagation":"none","containsHead":true}],["/app/apps/goldshore-web/src/pages/blog/index.astro",{"propagation":"none","containsHead":true}],["/app/apps/goldshore-web/src/pages/contact.astro",{"propagation":"none","containsHead":true}],["/app/apps/goldshore-web/src/pages/dash.astro",{"propagation":"none","containsHead":true}],["/app/apps/goldshore-web/src/pages/index.astro",{"propagation":"none","containsHead":true}],["/app/apps/goldshore-web/src/pages/privacy.astro",{"propagation":"none","containsHead":true}],["/app/apps/goldshore-web/src/pages/services/banproof.astro",{"propagation":"none","containsHead":true}],["/app/apps/goldshore-web/src/pages/services/bridgekeeper.astro",{"propagation":"none","containsHead":true}],["/app/apps/goldshore-web/src/pages/services/index.astro",{"propagation":"none","containsHead":true}],["/app/apps/goldshore-web/src/pages/team.astro",{"propagation":"none","containsHead":true}],["/app/apps/goldshore-web/src/pages/terms.astro",{"propagation":"none","containsHead":true}]],"renderers":[],"clientDirectives":[["idle","(()=>{var l=(o,t)=>{let i=async()=>{await(await o())()},e=typeof t.value==\"object\"?t.value:void 0,s={timeout:e==null?void 0:e.timeout};\"requestIdleCallback\"in window?window.requestIdleCallback(i,s):setTimeout(i,s.timeout||200)};(self.Astro||(self.Astro={})).idle=l;window.dispatchEvent(new Event(\"astro:idle\"));})();"],["load","(()=>{var e=async t=>{await(await t())()};(self.Astro||(self.Astro={})).load=e;window.dispatchEvent(new Event(\"astro:load\"));})();"],["media","(()=>{var s=(i,t)=>{let a=async()=>{await(await i())()};if(t.value){let e=matchMedia(t.value);e.matches?a():e.addEventListener(\"change\",a,{once:!0})}};(self.Astro||(self.Astro={})).media=s;window.dispatchEvent(new Event(\"astro:media\"));})();"],["only","(()=>{var e=async t=>{await(await t())()};(self.Astro||(self.Astro={})).only=e;window.dispatchEvent(new Event(\"astro:only\"));})();"],["visible","(()=>{var l=(s,i,o)=>{let r=async()=>{await(await s())()},t=typeof i.value==\"object\"?i.value:void 0,c={rootMargin:t==null?void 0:t.rootMargin},n=new IntersectionObserver(e=>{for(let a of e)if(a.isIntersecting){n.disconnect(),r();break}},c);for(let e of o.children)n.observe(e)};(self.Astro||(self.Astro={})).visible=l;window.dispatchEvent(new Event(\"astro:visible\"));})();"]],"entryModules":{"\u0000@astrojs-ssr-virtual-entry":"index.js","\u0000@astro-renderers":"renderers.mjs","\u0000@astro-page:src/pages/about@_@astro":"pages/about.astro.mjs","\u0000@astro-page:src/pages/admin/index@_@astro":"pages/admin.astro.mjs","\u0000@astro-page:src/pages/blog/index@_@astro":"pages/blog.astro.mjs","\u0000@astro-page:src/pages/contact@_@astro":"pages/contact.astro.mjs","\u0000@astro-page:src/pages/dash@_@astro":"pages/dash.astro.mjs","\u0000@astro-page:src/pages/privacy@_@astro":"pages/privacy.astro.mjs","\u0000@astro-page:src/pages/services/banproof@_@astro":"pages/services/banproof.astro.mjs","\u0000@astro-page:src/pages/services/bridgekeeper@_@astro":"pages/services/bridgekeeper.astro.mjs","\u0000@astro-page:src/pages/services/index@_@astro":"pages/services.astro.mjs","\u0000@astro-page:src/pages/team@_@astro":"pages/team.astro.mjs","\u0000@astro-page:src/pages/terms@_@astro":"pages/terms.astro.mjs","\u0000@astro-page:src/pages/index@_@astro":"pages/index.astro.mjs","\u0000astro-internal:middleware":"_astro-internal_middleware.mjs","\u0000@astro-page:../../node_modules/.pnpm/astro@4.16.19_@types+node@24.10.1_rollup@4.53.2_typescript@5.9.3/node_modules/astro/dist/assets/endpoint/generic@_@js":"pages/_image.astro.mjs","\u0000@astrojs-ssr-adapter":"_@astrojs-ssr-adapter.mjs","/app/apps/goldshore-web/src/scripts/contactSuccess.ts?url":"chunks/contactSuccess_BB-jbnsf.mjs","\u0000@astrojs-manifest":"manifest_B3ZkUe65.mjs","astro:scripts/page.js":"_astro/page.DOVBwqVB.js","astro:scripts/before-hydration.js":""},"inlinedScripts":[],"assets":["/_astro/contactSuccess.pmH0yUNm.ts","/_astro/about.zfoVTkO3.css","/_astro/contact.CiTv11fd.css","/_headers","/favicon.svg","/logo-wordmark-on-light.svg","/logo.svg","/robots.txt","/site.webmanifest","/sitemap.xml","/_astro/page.DOVBwqVB.js","/_worker.js/_@astrojs-ssr-adapter.mjs","/_worker.js/_astro-internal_middleware.mjs","/_worker.js/index.js","/_worker.js/renderers.mjs","/_worker.js/_astro/about.zfoVTkO3.css","/_worker.js/_astro/contact.CiTv11fd.css","/_worker.js/_astro/contactSuccess.pmH0yUNm.ts","/_worker.js/chunks/Base_CZo3b6gt.mjs","/_worker.js/chunks/astro-designed-error-pages_hZdTse4d.mjs","/_worker.js/chunks/astro_D1ZLKQoW.mjs","/_worker.js/chunks/contactSuccess_BB-jbnsf.mjs","/_worker.js/chunks/index_B5KL9XXw.mjs","/_worker.js/chunks/noop-middleware_BG_dj3Bx.mjs","/_worker.js/pages/_image.astro.mjs","/_worker.js/pages/about.astro.mjs","/_worker.js/pages/admin.astro.mjs","/_worker.js/pages/blog.astro.mjs","/_worker.js/pages/contact.astro.mjs","/_worker.js/pages/dash.astro.mjs","/_worker.js/pages/index.astro.mjs","/_worker.js/pages/privacy.astro.mjs","/_worker.js/pages/services.astro.mjs","/_worker.js/pages/team.astro.mjs","/_worker.js/pages/terms.astro.mjs","/_worker.js/chunks/astro/assets-service_6K6GS7BG.mjs","/_worker.js/chunks/astro/env-setup_nxDOIah1.mjs","/_worker.js/chunks/astro/server_Bbdr8WX7.mjs","/_worker.js/pages/services/banproof.astro.mjs","/_worker.js/pages/services/bridgekeeper.astro.mjs","/_astro/page.DOVBwqVB.js"],"buildFormat":"directory","checkOrigin":false,"serverIslandNameMap":[],"key":"SyrdTzx/KWgRQYSULlBldHTG67zkNmf8Xk0c48RfNpM=","experimentalEnvGetSecretEnabled":false});

export { manifest };
