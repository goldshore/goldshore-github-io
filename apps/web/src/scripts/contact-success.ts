const revealSuccess = () => {
  if (window.location.hash !== '#contact-success') {
    return;
  }

  const success = document.getElementById('contact-success');
  if (!success) {
    return;
  }

  success.removeAttribute('hidden');
};

const init = () => {
  revealSuccess();
};

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}

export {};
