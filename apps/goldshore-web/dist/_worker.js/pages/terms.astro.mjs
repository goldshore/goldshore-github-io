globalThis.process ??= {}; globalThis.process.env ??= {};
import { c as createComponent, f as renderComponent, e as renderTemplate, m as maybeRenderHead } from '../chunks/astro/server_Bbdr8WX7.mjs';
import { $ as $$Base } from '../chunks/Base_CZo3b6gt.mjs';
export { renderers } from '../renderers.mjs';

const $$Terms = createComponent(($$result, $$props, $$slots) => {
  const meta = {
    title: "Gold Shore Terms",
    description: "The engagement terms and acceptable use guidelines for Gold Shore services.",
    canonical: "https://goldshore.org/terms"
  };
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$Base, { ...meta }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 class="section-title">Terms of service</h1> <p class="section-subtitle">These terms govern your use of Gold Shore products, services, and digital assets.</p> <div class="card"> <h2>Highlights</h2> <ul> <li>Engagements are scoped in writing and billed per the agreed schedule.</li> <li>Confidential information shared with Gold Shore remains protected.</li> <li>We reserve the right to pause services if security risks are detected.</li> </ul> </div> <section class="section-spacing"> <h2 class="section-title">Questions</h2> <p>Email <a href="mailto:legal@goldshore.org">legal@goldshore.org</a> for clarifications or custom agreements.</p> </section> ` })}`;
}, "/app/apps/goldshore-web/src/pages/terms.astro", void 0);

const $$file = "/app/apps/goldshore-web/src/pages/terms.astro";
const $$url = "/terms";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Terms,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
