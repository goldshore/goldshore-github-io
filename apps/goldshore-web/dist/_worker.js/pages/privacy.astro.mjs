globalThis.process ??= {}; globalThis.process.env ??= {};
import { c as createComponent, f as renderComponent, e as renderTemplate, m as maybeRenderHead } from '../chunks/astro/server_Bbdr8WX7.mjs';
import { $ as $$Base } from '../chunks/Base_CZo3b6gt.mjs';
export { renderers } from '../renderers.mjs';

const $$Privacy = createComponent(($$result, $$props, $$slots) => {
  const meta = {
    title: "Gold Shore Privacy",
    description: "How Gold Shore collects, stores, and protects data across our sites and services.",
    canonical: "https://goldshore.org/privacy"
  };
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$Base, { ...meta }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 class="section-title">Privacy policy</h1> <p class="section-subtitle">Gold Shore respects your privacy and only collects data required to deliver our services.</p> <div class="card"> <h2>Data we collect</h2> <ul> <li>Contact details provided through forms.</li> <li>Analytics events used to improve product experience.</li> <li>Support conversations and onboarding documents.</li> </ul> </div> <section class="section-spacing"> <h2 class="section-title">Your controls</h2> <p>You can request data deletion or export at any time by emailing <a href="mailto:privacy@goldshore.org">privacy@goldshore.org</a>.</p> </section> ` })}`;
}, "/app/apps/goldshore-web/src/pages/privacy.astro", void 0);

const $$file = "/app/apps/goldshore-web/src/pages/privacy.astro";
const $$url = "/privacy";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Privacy,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
