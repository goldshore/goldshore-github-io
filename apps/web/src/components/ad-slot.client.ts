const schedule = (callback: () => void) => {
  const idleWindow = window as typeof window & {
    requestIdleCallback?: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => void;
  };

  if (typeof idleWindow.requestIdleCallback === 'function') {
    idleWindow.requestIdleCallback(() => callback(), { timeout: 2000 });
    return;
  }

  window.setTimeout(callback, 2000);
};

const loadAdScript = (clientId: string) => {
  const existingScript = document.querySelector<HTMLScriptElement>('script[data-adsbygoogle-loader]');
  if (existingScript) {
    return;
  }

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`;
  script.crossOrigin = 'anonymous';
  script.dataset.adsbygoogleLoader = 'true';
  document.head.appendChild(script);
};

const initAdSlots = () => {
  const slots = document.querySelectorAll<HTMLElement>('.ad-slot[data-ads="1"]');
  if (!slots.length) {
    return;
  }

  slots.forEach((slot) => {
    const clientId = slot.dataset.client ?? 'YOUR_ID';
    schedule(() => loadAdScript(clientId));
  });
};

const init = () => {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdSlots, { once: true });
  } else {
    initAdSlots();
  }
};

if (typeof window !== 'undefined') {
  init();
}

export {};
