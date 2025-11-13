globalThis.process ??= {}; globalThis.process.env ??= {};
import { c as createComponent, a as createAstro, b as addAttribute, r as renderHead, d as renderSlot, e as renderTemplate } from './astro/server_Bbdr8WX7.mjs';
/* empty css                         */

const $$Astro = createAstro();
const $$Base = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Base;
  const faviconUrl = "/favicon.svg";
  const nav = [
    { label: "Products", href: "#products" },
    { label: "Trading Dashboard", href: "/dash" },
    { label: "Pricing", href: "#pricing" },
    { label: "Blog", href: "/blog" },
    { label: "Docs", href: "https://api.goldshore.org/v1/docs" },
    { label: "Admin", href: "https://admin.goldshore.org" }
  ];
  const nonce = Astro2.locals?.nonce ?? "";
  return renderTemplate`<html lang="en"${addAttribute(nonce, "data-csp-nonce")}> <head><meta charset="utf-8"><link rel="icon" type="image/svg+xml"${addAttribute(faviconUrl, "href")}><link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="manifest" href="/site.webmanifest"><title>GoldShore</title>${renderHead()}</head> <body class="bg-[var(--bg)] text-[var(--text)]"> <header class="mx-auto max-w-7xl p-4 flex items-center gap-6"> <img src="/logo-wordmark-on-light.svg" alt="GoldShore" height="28"> <nav class="ml-auto flex gap-5"> ${nav.map((n) => renderTemplate`<a${addAttribute(n.href, "href")} class="hover:underline">${n.label}</a>`)} <a href="/signup" class="px-3 py-1 rounded bg-[var(--brand)] text-[var(--brand-contrast)]">Get Started</a> </nav> </header> ${renderSlot($$result, $$slots["default"])} </body></html>`;
}, "/app/apps/goldshore-web/src/layouts/Base.astro", void 0);

export { $$Base as $ };
