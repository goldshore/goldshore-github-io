import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({ imageService: 'passthrough' }),
  vite: { build: { assetsInlineLimit: 0 } },
  integrations: [
    {
      name: 'csp-nonce',
      hooks: {
        'astro:config:setup': ({ injectScript }) => {
          injectScript('page', `
            const nonce = '__CSP_NONCE__';
            if (nonce && nonce !== '__CSP_NONCE__') {
              const scripts = document.querySelectorAll('script');
              scripts.forEach(script => {
                if (!script.getAttribute('nonce')) {
                  script.setAttribute('nonce', nonce);
                }
              });
            }
          `);
        },
      },
    },
  ],
});
