globalThis.process ??= {}; globalThis.process.env ??= {};
import { renderers } from './renderers.mjs';
import { createExports } from './_@astrojs-ssr-adapter.mjs';
import { manifest } from './manifest_C1HU6r9o.mjs';

const _page0 = () => import('./pages/_image.astro.mjs');
const _page1 = () => import('./pages/about.astro.mjs');
const _page2 = () => import('./pages/admin.astro.mjs');
const _page3 = () => import('./pages/blog.astro.mjs');
const _page4 = () => import('./pages/contact.astro.mjs');
const _page5 = () => import('./pages/dash.astro.mjs');
const _page6 = () => import('./pages/privacy.astro.mjs');
const _page7 = () => import('./pages/services/banproof.astro.mjs');
const _page8 = () => import('./pages/services/bridgekeeper.astro.mjs');
const _page9 = () => import('./pages/services.astro.mjs');
const _page10 = () => import('./pages/team.astro.mjs');
const _page11 = () => import('./pages/terms.astro.mjs');
const _page12 = () => import('./pages/index.astro.mjs');

const pageMap = new Map([
    ["../../node_modules/.pnpm/astro@4.16.19_@types+node@22.19.1_rollup@4.53.2_typescript@5.9.3/node_modules/astro/dist/assets/endpoint/generic.js", _page0],
    ["src/pages/about.astro", _page1],
    ["src/pages/admin/index.astro", _page2],
    ["src/pages/blog/index.astro", _page3],
    ["src/pages/contact.astro", _page4],
    ["src/pages/dash.astro", _page5],
    ["src/pages/privacy.astro", _page6],
    ["src/pages/services/banproof.astro", _page7],
    ["src/pages/services/bridgekeeper.astro", _page8],
    ["src/pages/services/index.astro", _page9],
    ["src/pages/team.astro", _page10],
    ["src/pages/terms.astro", _page11],
    ["src/pages/index.astro", _page12]
]);
const serverIslandMap = new Map();
const _manifest = Object.assign(manifest, {
    pageMap,
    serverIslandMap,
    renderers,
    middleware: () => import('./_astro-internal_middleware.mjs')
});
const _exports = createExports(_manifest);
const __astrojsSsrVirtualEntry = _exports.default;

export { __astrojsSsrVirtualEntry as default, pageMap };
