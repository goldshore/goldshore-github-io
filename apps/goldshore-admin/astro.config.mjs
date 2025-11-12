import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({ imageService: 'passthrough' }),
  vite: {
    build: { assetsInlineLimit: 0 },
    ssr: { target: 'webworker' },
    resolve: {
      alias: {
        'node:crypto': false,
        crypto: false,
      },
    },
    optimizeDeps: {
      exclude: ['node:crypto'],
    },
  },
  integrations: [
    {
      name: 'csp-nonce',
      hooks: {
        'astro:config:setup': ({ injectScript }) => {
          injectScript('page', `
            const nonce = document.documentElement.dataset.cspNonce;
            if (nonce) {
              const scripts = document.querySelectorAll('script');
              scripts.forEach(script => {
                script.setAttribute('nonce', nonce);
              });
            }
          `);
        },
      },
    },
  ],
});
