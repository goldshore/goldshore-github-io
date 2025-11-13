globalThis.process ??= {}; globalThis.process.env ??= {};
import { c as createComponent, f as renderComponent, e as renderTemplate, m as maybeRenderHead, b as addAttribute } from '../chunks/astro/server_Bbdr8WX7.mjs';
import { $ as $$Base } from '../chunks/Base_CZo3b6gt.mjs';
export { renderers } from '../renderers.mjs';

const $$Index = createComponent(($$result, $$props, $$slots) => {
  const meta = {
    title: "Gold Shore Signals \u2014 Research and analysis",
    description: "Read the latest Gold Shore research on market catalysts, launch tactics, and narrative design for high-velocity founders.",
    canonical: "https://goldshore.org/blog"
  };
  const posts = [
    {
      title: "Designing launch systems that compound",
      summary: "A primer on sequencing announcements, capital updates, and product drops without burning trust.",
      href: "/repo/launch-systems"
    },
    {
      title: "Reputation defense playbook",
      summary: "What it takes to neutralise policy shocks across platforms without losing growth momentum.",
      href: "/repo/reputation-defense"
    }
  ];
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$Base, { ...meta }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 class="section-title">Signals</h1> <p class="section-subtitle">Analytical notes, campaign retrospectives, and market intel direct from the Gold Shore desk.</p> <div class="grid"> ${posts.map((post) => renderTemplate`<article class="card"> <h2>${post.title}</h2> <p>${post.summary}</p> <a${addAttribute(post.href, "href")}>Read more →</a> </article>`)} </div> ` })}`;
}, "/app/apps/goldshore-web/src/pages/blog/index.astro", void 0);

const $$file = "/app/apps/goldshore-web/src/pages/blog/index.astro";
const $$url = "/blog";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
