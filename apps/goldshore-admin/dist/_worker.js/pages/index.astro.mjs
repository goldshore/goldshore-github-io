globalThis.process ??= {}; globalThis.process.env ??= {};
import { c as createComponent, a as createAstro, b as addAttribute, m as maybeRenderHead, r as renderSlot, d as renderTemplate, e as renderComponent } from '../chunks/astro/server_BsANcA-p.mjs';
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$Admin = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Admin;
  const logoUrl = "/placeholder.svg";
  const items = ["Dashboard", "Customers", "Subscriptions", "Workflows", "Trading", "Orders", "Risk", "Reports", "Settings"];
  const nonce = Astro2.locals?.nonce ?? "";
  return renderTemplate`<html${addAttribute(nonce, "data-csp-nonce")}> ${maybeRenderHead()}<body class="bg-[var(--bg)] text-[var(--text)]"> <aside class="fixed left-0 top-0 h-full w-56 border-r p-4"> <img${addAttribute(logoUrl, "src")} height="24" alt="GoldShore"> <ul class="mt-4 space-y-2"> ${items.map((i) => renderTemplate`<li><a${addAttribute(`/${i.toLowerCase()}`, "href")} class="hover:underline">${i}</a></li>`)} </ul> </aside> <main class="ml-56 p-6">${renderSlot($$result, $$slots["default"])}</main> </body></html>`;
}, "/app/apps/goldshore-admin/src/layouts/Admin.astro", void 0);

const $$Index = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Admin", $$Admin, {}, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<section class="space-y-4"> <h1 class="text-2xl font-bold">Trading Ops Overview</h1> <p>Welcome to the GoldShore admin console. Choose a module from the sidebar to review customer activity, risk posture, and real-time trading telemetry.</p> <div class="grid gap-4 md:grid-cols-2"> <article class="border rounded p-4"> <h2 class="font-semibold">Leads</h2> <p>Monitor newly captured leads from marketing funnels synced via the API.</p> </article> <article class="border rounded p-4"> <h2 class="font-semibold">Risk Alerts</h2> <p>Review threshold breaches, net exposure drifts, and automated interventions.</p> </article> </div> </section> ` })}`;
}, "/app/apps/goldshore-admin/src/pages/index.astro", void 0);

const $$file = "/app/apps/goldshore-admin/src/pages/index.astro";
const $$url = "";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
