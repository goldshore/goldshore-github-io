// --- Mobile nav toggle ---
const navToggle = document.getElementById('navToggle');
const mobileMenu = document.getElementById('mobileMenu');
const iconOpen = document.getElementById('iconOpen');
const iconClose = document.getElementById('iconClose');

if (navToggle && mobileMenu) {
  navToggle.addEventListener('click', () => {
    const isOpen = mobileMenu.classList.toggle('hidden') === false;
    navToggle.setAttribute('aria-expanded', String(isOpen));
    iconOpen.classList.toggle('hidden', isOpen);
    iconClose.classList.toggle('hidden', !isOpen);
  });

  // Close on link click
  mobileMenu.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      mobileMenu.classList.add('hidden');
      navToggle.setAttribute('aria-expanded', 'false');
      iconOpen.classList.remove('hidden');
      iconClose.classList.add('hidden');
    });
  });

  // Close on ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      mobileMenu.classList.add('hidden');
      navToggle.setAttribute('aria-expanded', 'false');
      iconOpen.classList.remove('hidden');
      iconClose.classList.add('hidden');
    }
  });
}

// --- Swiper init ---
document.addEventListener('DOMContentLoaded', () => {
  const hero = document.querySelector('.hero-swiper');
  if (hero && window.Swiper) {
    let reduceMotion = false;
    if (typeof window.matchMedia === 'function') {
      reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    new Swiper(hero, {
      loop: !reduceMotion,
      autoplay: reduceMotion ? false : { delay: 4000 },
      pagination: { el: '.swiper-pagination', clickable: true }
    });
  }

  const testimonials = document.querySelector('.testimonials-swiper');
  if (testimonials && window.Swiper) {
    let reduceMotion = false;
    if (typeof window.matchMedia === 'function') {
      reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    new Swiper(testimonials, {
      loop: !reduceMotion,
      autoplay: reduceMotion ? false : { delay: 5000 },
      spaceBetween: 24,
      slidesPerView: 1,
      pagination: { el: '.testimonials-pagination', clickable: true },
      breakpoints: {
        768: { slidesPerView: 1.5 },
        1024: { slidesPerView: 2 },
        1280: { slidesPerView: 2.5 }
      }
    });
  }
});

// --- Analytics events (GA4) ---
function track(name, params) {
  if (typeof window.gtagTrack === 'function') {
    window.gtagTrack(name, Object.assign({ page: location.pathname }, params || {}));
  }
}

// CTA clicks
document.querySelectorAll('[data-cta]').forEach(el => {
  el.addEventListener('click', () => {
    track('cta_click', { cta: el.dataset.cta, text: (el.textContent || '').trim() });
  });
});

// External links (basic)
document.querySelectorAll('a[href^="http"]').forEach(a => {
  try {
    const isExternal = new URL(a.href).host !== location.host;
    if (isExternal) {
      a.addEventListener('click', () => {
        track('outbound_click', { url: a.href });
      });
    }
  } catch (e) {}
});

// Contact form submit
const contactForm = document.getElementById('primaryContactForm');
if (contactForm) {
  contactForm.addEventListener('submit', () => {
    track('contact_submit', {});
  });
}

window.addEventListener('contact:success', (event) => {
  const detail = event && event.detail ? event.detail : {};
  track('contact_submit_success', {
    form_id: detail.formId || 'primaryContactForm',
    transport_type: detail.transportType || 'redirect'
  });
});

// Pricing toggle
const pricingToggles = document.querySelectorAll('[data-pricing-toggle]');
if (pricingToggles.length) {
  const priceTargets = document.querySelectorAll('[data-price-target]');
  const priceFrequencies = document.querySelectorAll('[data-price-frequency]');
  const priceDetails = document.querySelectorAll('[data-price-detail]');
  const caption = document.querySelector('[data-pricing-caption]');
  let activePeriod = 'monthly';

  const setActive = (period, shouldTrack = false) => {
    if (!period) period = 'monthly';
    activePeriod = period;

    pricingToggles.forEach(btn => {
      const isActive = btn.dataset.period === period;
      btn.classList.toggle('pricing-toggle--active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });

    priceTargets.forEach(el => {
      const key = period === 'annual' ? 'priceAnnual' : 'priceMonthly';
      if (el.dataset[key]) {
        el.textContent = el.dataset[key];
      }
    });

    priceFrequencies.forEach(el => {
      const key = period === 'annual' ? 'frequencyAnnual' : 'frequencyMonthly';
      if (el.dataset[key]) {
        el.textContent = el.dataset[key];
      }
    });

    priceDetails.forEach(el => {
      const key = period === 'annual' ? 'detailAnnual' : 'detailMonthly';
      if (el.dataset[key]) {
        el.textContent = el.dataset[key];
      }
    });

    if (caption) {
      const key = period === 'annual' ? 'captionAnnual' : 'captionMonthly';
      if (caption.dataset[key]) {
        caption.textContent = caption.dataset[key];
      }
    }

    if (shouldTrack) {
      track('pricing_toggle_change', { period });
    }
  };

  pricingToggles.forEach(btn => {
    btn.addEventListener('click', () => {
      const period = btn.dataset.period || 'monthly';
      if (period === activePeriod) return;
      setActive(period, true);
    });
  });

  setActive(activePeriod, false);
}

// FAQ accordion
document.querySelectorAll('[data-faq-toggle]').forEach(btn => {
  const panelId = btn.getAttribute('aria-controls');
  const panel = panelId ? document.getElementById(panelId) : null;
  if (!panel) return;

  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    const nextState = !expanded;
    btn.setAttribute('aria-expanded', String(nextState));
    panel.classList.toggle('hidden', !nextState);
    panel.hidden = !nextState;
    track('faq_toggle', {
      question: btn.dataset.faqQuestion || panelId,
      expanded: nextState
    });
  });
});

