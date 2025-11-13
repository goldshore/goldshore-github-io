globalThis.process ??= {}; globalThis.process.env ??= {};
import { c as createComponent, f as renderComponent, e as renderTemplate, m as maybeRenderHead } from '../chunks/astro/server_Bbdr8WX7.mjs';
import { $ as $$Base } from '../chunks/Base_CZo3b6gt.mjs';
export { renderers } from '../renderers.mjs';

const $$Index = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Base", $$Base, {}, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<main class="mx-auto max-w-6xl p-6"> <section class="py-12"> <h1 class="font-display text-4xl">GoldShore — trading infrastructure & insights</h1> <div class="mt-4 flex gap-3"> <a href="/dash" class="px-4 py-2 rounded bg-[var(--brand)] text-[var(--brand-contrast)]">Launch Dashboard</a> <a href="https://api.goldshore.org/v1/docs" class="px-4 py-2 rounded border border-[var(--border)]">View API Docs</a> </div> </section> <section id="products" class="grid md:grid-cols-3 gap-4 py-8"> <a class="p-4 border rounded" href="https://api.goldshore.org/v1/health">Trading API</a> <a class="p-4 border rounded" href="https://api.goldshore.org/v1/risk/limits">Options & Risk</a> <a class="p-4 border rounded" href="https://admin.goldshore.org">Admin & CRM</a> </section> <section id="pricing" class="grid md:grid-cols-3 gap-4 py-8"> <a class="p-4 border rounded" href="/signup?plan=free">Free</a> <a class="p-4 border rounded" href="/signup?plan=pro">Pro</a> <a class="p-4 border rounded" href="/signup?plan=enterprise">Enterprise</a> </section> <section id="contact" class="py-8"> <form method="post" action="https://api.goldshore.org/v1/lead" class="flex gap-2"> <input name="email" type="email" required placeholder="you@company.com" class="border p-2 rounded flex-1"> <button class="px-4 py-2 rounded bg-[var(--brand)] text-[var(--brand-contrast)]" type="submit">Request Access</button> </form> </section> </main> ` })}`;
}, "/app/apps/goldshore-web/src/pages/index.astro", void 0);

const $$file = "/app/apps/goldshore-web/src/pages/index.astro";
const $$url = "";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
