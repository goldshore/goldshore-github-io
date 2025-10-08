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
  const el = document.querySelector('.hero-swiper');
  if (el && window.Swiper) {
    let reduceMotion = false;
    if (typeof window.matchMedia === 'function') {
      reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    new Swiper(el, {
      loop: !reduceMotion,
      autoplay: reduceMotion ? false : { delay: 4000 },
      pagination: { el: '.swiper-pagination', clickable: true }
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

