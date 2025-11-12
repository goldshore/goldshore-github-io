globalThis.process ??= {}; globalThis.process.env ??= {};
import { c as createComponent, f as renderComponent, e as renderTemplate, m as maybeRenderHead } from '../chunks/astro/server_Bbdr8WX7.mjs';
import { $ as $$Base } from '../chunks/Base_CZo3b6gt.mjs';
export { renderers } from '../renderers.mjs';

const $$Index = createComponent(($$result, $$props, $$slots) => {
  const meta = {
    title: "Gold Shore Services \u2014 Launch, defend, and scale",
    description: "Explore Gold Shore\u2019s modular services spanning launch architecture, reputation defense, and intelligence operations.",
    canonical: "https://goldshore.org/services"
  };
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$Base, { ...meta }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 class="section-title">Services</h1> <p class="section-subtitle">
Start with a single blueprint or stitch tracks together for an always-on partnership. Every engagement includes a dedicated
    operator, access to our research desk, and Cloudflare-secured infrastructure.
</p> <div class="grid grid-2"> <article class="card"> <h2>Bridgekeeper</h2> <p>Launch architecture from positioning to activation with a four-week playbook.</p> <a href="/services/bridgekeeper">View service overview →</a> </article> <article class="card"> <h2>Banproof</h2> <p>Reputation defense and incident response designed for regulated and frontier markets.</p> <a href="/services/banproof">View service overview →</a> </article> <article class="card"> <h2>Fractional comms desk</h2> <p>Embed a senior strategist and creative pod to manage launches, announcements, and stakeholder comms.</p> <a href="/contact">Book a discovery call →</a> </article> <article class="card"> <h2>Intelligence ops</h2> <p>Dashboards, analytics, and revenue reporting to keep your GTM machine accountable.</p> <a href="/contact">Request a scope →</a> </article> </div> <section class="section-spacing"> <h2 class="section-title">How we work</h2> <ul> <li>Preview every deliverable in a Cloudflare Pages environment before it ships to production.</li> <li>Protect sensitive dashboards behind Cloudflare Access with hardware key support.</li> <li>Pair founders with asynchronous updates delivered via Notion or Linear.</li> </ul> </section> ` })}`;
}, "/app/apps/goldshore-web/src/pages/services/index.astro", void 0);

const $$file = "/app/apps/goldshore-web/src/pages/services/index.astro";
const $$url = "/services";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
