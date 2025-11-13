globalThis.process ??= {}; globalThis.process.env ??= {};
import { c as createComponent, f as renderComponent, e as renderTemplate, m as maybeRenderHead } from '../chunks/astro/server_Bbdr8WX7.mjs';
import { $ as $$Base } from '../chunks/Base_CZo3b6gt.mjs';
export { renderers } from '../renderers.mjs';

const $$Index = createComponent(($$result, $$props, $$slots) => {
  const meta = {
    title: "Gold Shore Admin",
    description: "Operational dashboard shell for authenticated Gold Shore staff via Cloudflare Access.",
    canonical: "https://goldshore.org/admin",
    noIndex: true
  };
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$Base, { ...meta }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 class="section-title">Admin control room</h1> <p class="section-subtitle">
This area is protected by Cloudflare Access. Use it to review launch runbooks, monitor reputation alerts, and trigger cache
    purges across environments.
</p> <div class="grid"> <section class="card"> <h2>Launch runbooks</h2> <p>Check status of upcoming drops, approvals, and asset readiness.</p> <a href="https://notion.so" rel="noopener" target="_blank">Open runbooks →</a> </section> <section class="card"> <h2>Reputation console</h2> <p>View incidents synced from Workers KV and trigger response playbooks.</p> <button class="btn ghost" type="button">Open console</button> </section> <section class="card"> <h2>Cache &amp; deploy</h2> <p>Run cache purges or promote previews to production with one click.</p> <button class="btn" type="button">Launch Wrangler</button> </section> </div> ` })}`;
}, "/app/apps/goldshore-web/src/pages/admin/index.astro", void 0);

const $$file = "/app/apps/goldshore-web/src/pages/admin/index.astro";
const $$url = "/admin";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
