globalThis.process ??= {}; globalThis.process.env ??= {};
import { c as createComponent, f as renderComponent, e as renderTemplate, m as maybeRenderHead } from '../chunks/astro/server_Bbdr8WX7.mjs';
import { $ as $$Base } from '../chunks/Base_CZo3b6gt.mjs';
export { renderers } from '../renderers.mjs';

const $$Team = createComponent(($$result, $$props, $$slots) => {
  const meta = {
    title: "Gold Shore Team \u2014 Operators, storytellers, defenders",
    description: "Meet the multi-disciplinary team behind Gold Shore: brand strategists, market analysts, and technologists delivering rapid launch and reputation outcomes.",
    canonical: "https://goldshore.org/team"
  };
  const team = [
    {
      name: "Jack Wren",
      role: "Founder & Lead Strategist",
      bio: "Former agency partner at BBDO and comms lead for multiple IPOs. Crafts the narrative spine for every engagement."
    },
    {
      name: "Amina Solano",
      role: "Growth Architect",
      bio: "Builds funnels, automations, and analytics frameworks that keep launches accountable and measurable."
    },
    {
      name: "Theo Cruz",
      role: "Capital Markets Analyst",
      bio: "Monitors macro catalysts and investor sentiment to ensure messaging syncs with market reality."
    },
    {
      name: "Lena Park",
      role: "Creative Director",
      bio: "Designs the visual language for campaigns, websites, and investor collateral with accessibility at the core."
    }
  ];
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$Base, { ...meta }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 class="section-title">Team Gold Shore</h1> <p class="section-subtitle">
We’re a distributed crew of operators and creatives who act like an embedded unit, not a distant agency. Every project pairs
    strategic leadership with hands-on builders.
</p> <div class="grid grid-2"> ${team.map((member) => renderTemplate`<article class="card" role="listitem"> <h2>${member.name}</h2> <p class="text-lav-strong">${member.role}</p> <p>${member.bio}</p> </article>`)} </div> <section class="section-spacing"> <h2 class="section-title">Join the roster</h2> <p class="section-subtitle">
Gold Shore partners with senior independents and boutique studios. Share your craft, proof of work, and the types of
      founders you champion.
</p> <a class="btn" href="mailto:talent@goldshore.org">Pitch your work</a> </section> ` })}`;
}, "/app/apps/goldshore-web/src/pages/team.astro", void 0);

const $$file = "/app/apps/goldshore-web/src/pages/team.astro";
const $$url = "/team";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Team,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
