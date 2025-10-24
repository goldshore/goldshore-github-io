import cloudflare from '@astrojs/cloudflare';
export default {
  output: 'server',
  adapter: cloudflare({}),
  vite: { build: { assetsInlineLimit: 0 } }
};
