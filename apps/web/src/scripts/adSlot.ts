const slots = document.querySelectorAll<HTMLElement>('.ad-slot[data-ads="1"]');

if (slots.length > 0) {
  const schedule = (callback: () => void) => {
    if ('requestIdleCallback' in window) {
      (window as typeof window & { requestIdleCallback(callback: () => void, options?: { timeout: number }): number }).requestIdleCallback(
        callback,
        { timeout: 2000 }
      );
    } else {
      window.setTimeout(callback, 2000);
    }
  };

  const loadScript = (clientId: string) => {
    const src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`;
    const existing = document.querySelector<HTMLScriptElement>(`script[data-ads-loader="${src}"]`);

    if (existing) {
      return;
    }

    const script = document.createElement('script');
    script.async = true;
    script.src = src;
    script.crossOrigin = 'anonymous';
    script.dataset.adsLoader = src;
    document.head.appendChild(script);
  };

  slots.forEach((slot) => {
    const clientId = slot.dataset.client ?? 'YOUR_ID';
    schedule(() => loadScript(clientId));
  });
}
