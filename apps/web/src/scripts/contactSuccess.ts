const success = document.getElementById('contact-success');

if (success) {
  const reveal = () => {
    if (window.location.hash === '#contact-success') {
      success.classList.add('is-visible');
    }
  };

  reveal();
  window.addEventListener('hashchange', reveal);
}
