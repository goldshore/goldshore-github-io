globalThis.process ??= {}; globalThis.process.env ??= {};
import { c as createComponent, f as renderComponent, e as renderTemplate, b as addAttribute, m as maybeRenderHead } from '../chunks/astro/server_Bbdr8WX7.mjs';
import { $ as $$Base } from '../chunks/Base_CZo3b6gt.mjs';
/* empty css                                   */
export { renderers } from '../renderers.mjs';

var __freeze = Object.freeze;
var __defProp = Object.defineProperty;
var __template = (cooked, raw) => __freeze(__defProp(cooked, "raw", { value: __freeze(cooked.slice()) }));
var _a, _b;
const $$Contact = createComponent(async ($$result, $$props, $$slots) => {
  const meta = {
    title: "Contact Gold Shore — Book a strategy session",
    description: "Request a working session with Gold Shore to plan your launch, narrative defense, or growth initiative.",
    canonical: "https://goldshore.org/contact"
  };
  const turnstileSiteKey = "0x4AAAAAABpjjYpo5oUPFCrE";
  const contactScript = await import('../chunks/contactSuccess_BB-jbnsf.mjs');
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$Base, { ...meta }, { "default": async ($$result2) => renderTemplate(_b || (_b = __template([" ", '<h1 class="section-title">Let’s build momentum</h1> <p class="section-subtitle">\nShare your focus area and timeline. We’ll align on scope within one business day and route you to the right operator.\n</p> <form class="card contact-form" action="/api/contact" method="POST"> <input type="hidden" name="_redirect" value="/contact#contact-success"> <div> <label for="name">Name</label> <input id="name" name="name" type="text" required placeholder="Ada Lovelace" class="contact-field"> </div> <div> <label for="email">Email</label> <input id="email" name="email" type="email" required placeholder="you@example.com" class="contact-field"> </div> <div> <label for="focus">What do you need?</label> <select id="focus" name="focus" required class="contact-field"></select><input type="hidden" name="_redirect" value="/contact#contact-success"> <div> <label for="name">Name</label> <input id="name" name="name" type="text" required placeholder="Ada Lovelace" class="contact-control"> </div> <div> <label for="email">Email</label> <input id="email" name="email" type="email" required placeholder="you@example.com" class="contact-control"> </div> <div> <label for="focus">What do you need?</label> <select id="focus" name="focus" required class="contact-control"> <option value="">Select a track</option> <option>Launch architecture</option> <option>Reputation defense</option> <option>Intelligence ops</option> <option>Other</option> </select> </div> <div> <label for="message">Context</label> <textarea id="message" name="message" rows="5" required placeholder="Tell us about the product, timeline, and any material we should review." class="contact-control"></textarea> </div> ', ' <button class="btn" type="submit">Submit request</button> <div id="contact-success" class="card contact-success" hidden> <p class="contact-success__message">Thanks for the note—we’ll reach out within one business day.</p> </div> ', ' <script type="module"', '></script> <section class="contact-availability"> <h2 class="section-title">Availability</h2> <p class="section-subtitle">We host strategy calls on Tuesdays and Thursdays. Urgent reputation work is on-call 24/7.</p> <div class="card"> <p class="no-margin">Prefer async? Email <a href="mailto:intake@goldshore.org">intake@goldshore.org</a> with decks, briefs, or data rooms.</p> </div> </section> </div></form>'])), maybeRenderHead(), renderTemplate`<div class="turnstile-wrapper"> <div class="cf-turnstile"${addAttribute(turnstileSiteKey, "data-sitekey")} data-theme="dark"></div> </div>`, renderTemplate(_a || (_a = __template(['<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>']))), addAttribute(contactScript.default, "src")) })}`;
}, "/app/apps/goldshore-web/src/pages/contact.astro", void 0);
const $$file = "/app/apps/goldshore-web/src/pages/contact.astro";
const $$url = "/contact";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Contact,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
