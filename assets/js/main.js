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

// Hero CTA emphasis
document.querySelectorAll('[data-hero-cta]').forEach(el => {
  el.addEventListener('click', () => {
    track('hero_cta_click', {
      cta: el.dataset.cta,
      hero_cta: el.dataset.heroCta || el.dataset.cta,
      text: (el.textContent || '').trim()
    });
  });
});

// Plan card CTA emphasis
document.querySelectorAll('[data-plan-cta]').forEach(el => {
  el.addEventListener('click', () => {
    track('plan_cta_click', {
      cta: el.dataset.cta,
      plan_action: el.dataset.planCta || 'cta',
      text: (el.textContent || '').trim()
    });
  });
});

// Plan card detail toggle
document.querySelectorAll('[data-plan-toggle]').forEach(button => {
  const targetSelector = button.dataset.planToggleTarget;
  if (!targetSelector) return;

  const target = document.querySelector(targetSelector);
  if (!target) return;

  const labelOpen = button.dataset.planToggleLabelOpen || button.textContent;
  const labelClose = button.dataset.planToggleLabelClose || labelOpen;

  button.addEventListener('click', () => {
    const isHidden = target.classList.toggle('hidden');
    const expanded = !isHidden;
    button.setAttribute('aria-expanded', String(expanded));
    button.textContent = expanded ? labelClose : labelOpen;

    track('plan_details_toggle', {
      expanded,
      target: targetSelector
    });
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

