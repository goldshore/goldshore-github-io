globalThis.process ??= {}; globalThis.process.env ??= {};
import { c as createComponent, f as renderComponent, e as renderTemplate, m as maybeRenderHead } from '../../chunks/astro/server_Bbdr8WX7.mjs';
import { $ as $$Base } from '../../chunks/Base_CZo3b6gt.mjs';
export { renderers } from '../../renderers.mjs';

const $$Banproof = createComponent(($$result, $$props, $$slots) => {
  const meta = {
    title: "Banproof \u2014 Gold Shore reputation defense",
    description: "Banproof keeps your narrative resilient with monitoring, response playbooks, and crisis comms shipped from Cloudflare Workers.",
    canonical: "https://goldshore.org/services/banproof"
  };
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$Base, { ...meta }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 class="section-title">Banproof</h1> <p class="section-subtitle">
When the market turns or platforms shift policy, Banproof keeps your company online and on-message. We mix research, comms,
    and infrastructure hardening to neutralise threats.
</p> <div class="card"> <h2>Core coverage</h2> <ul> <li>Always-on monitoring across press, social, and community channels.</li> <li>Rapid incident response with templated statements and executive briefing docs.</li> <li>Content syndication and SEO to restore trust post-incident.</li> </ul> </div> <section class="section-spacing"> <h2 class="section-title">Stack integrations</h2> <ul> <li>Cloudflare Turnstile + Access to protect internal dashboards.</li> <li>Workers KV for incident logs and coordination.</li> <li>GitHub automation for rapid PRs, press updates, and stakeholder memos.</li> </ul> <a class="btn" href="/contact">Engage Banproof</a> </section> ` })}`;
}, "/app/apps/goldshore-web/src/pages/services/banproof.astro", void 0);

const $$file = "/app/apps/goldshore-web/src/pages/services/banproof.astro";
const $$url = "/services/banproof";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Banproof,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
