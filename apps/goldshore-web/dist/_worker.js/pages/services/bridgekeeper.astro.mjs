globalThis.process ??= {}; globalThis.process.env ??= {};
import { c as createComponent, f as renderComponent, e as renderTemplate, m as maybeRenderHead } from '../../chunks/astro/server_Bbdr8WX7.mjs';
import { $ as $$Base } from '../../chunks/Base_CZo3b6gt.mjs';
export { renderers } from '../../renderers.mjs';

const $$Bridgekeeper = createComponent(($$result, $$props, $$slots) => {
  const meta = {
    title: "Bridgekeeper \u2014 Gold Shore launch architecture",
    description: "Bridgekeeper is Gold Shore\u2019s four-week launch program that distills positioning, GTM sequencing, and activation assets into a single operating system.",
    canonical: "https://goldshore.org/services/bridgekeeper"
  };
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$Base, { ...meta }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 class="section-title">Bridgekeeper</h1> <p class="section-subtitle">
An intensive launch program that takes you from raw product to market-ready narrative. We align product marketing, sales,
    and investor comms in four sprints.
</p> <div class="card"> <h2>Program timeline</h2> <ol> <li><strong>Sprint 1:</strong> Customer thesis, value pillars, and proof of work.</li> <li><strong>Sprint 2:</strong> Messaging arcs, product storytelling, and objection handling.</li> <li><strong>Sprint 3:</strong> Activation playbook across owned, earned, and paid media.</li> <li><strong>Sprint 4:</strong> Launch rehearsal, analytics wiring, and investor collateral.</li> </ol> </div> <section class="section-spacing"> <h2 class="section-title">Included assets</h2> <ul> <li>Launch site or landing page wired to Cloudflare Pages + Worker routing.</li> <li>Deck and memo templates for investors, partners, and enterprise prospects.</li> <li>Automated reporting dashboards delivered via the Gold Shore admin shell.</li> </ul> <a class="btn" href="/contact">Book Bridgekeeper</a> </section> ` })}`;
}, "/app/apps/goldshore-web/src/pages/services/bridgekeeper.astro", void 0);

const $$file = "/app/apps/goldshore-web/src/pages/services/bridgekeeper.astro";
const $$url = "/services/bridgekeeper";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Bridgekeeper,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
