const setupHeaderMenu = () => {
  const toggleButton = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
  const mobileMenu = document.querySelector<HTMLElement>('[data-mobile-menu]');

  if (!toggleButton || !mobileMenu) {
    return;
  }

  let isOpen = false;
  const focusableSelectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(', ');

  const getFocusableItems = () => mobileMenu.querySelectorAll<HTMLElement>(focusableSelectors);

  const setButtonState = () => {
    toggleButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    toggleButton.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
  };

  const setMenuState = () => {
    mobileMenu.hidden = !isOpen;
    mobileMenu.classList.toggle('is-open', isOpen);
    mobileMenu.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      return;
    }

    if (event.key === 'Tab' && isOpen) {
      const focusable = Array.from(getFocusableItems());
      if (!focusable.length) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    }
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (!isOpen) {
      return;
    }

    if (
      mobileMenu.contains(event.target as Node) ||
      toggleButton === event.target ||
      toggleButton.contains(event.target as Node)
    ) {
      return;
    }

    closeMenu({ returnFocus: false });
  };

  const openMenu = () => {
    if (isOpen) {
      return;
    }

    isOpen = true;
    setMenuState();
    requestAnimationFrame(() => {
      const [firstFocusable] = getFocusableItems();
      firstFocusable?.focus();
    });
    setButtonState();
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
  };

  const closeMenu = ({ returnFocus = true }: { returnFocus?: boolean } = {}) => {
    if (!isOpen) {
      return;
    }

    isOpen = false;
    setMenuState();
    setButtonState();
    if (returnFocus) {
      toggleButton.focus();
    }
    document.removeEventListener('keydown', handleKeyDown);
    document.removeEventListener('pointerdown', handlePointerDown);
  };

  toggleButton.addEventListener('click', () => {
    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  const mediaQuery = window.matchMedia('(min-width: 901px)');
  const handleMediaChange = (event: MediaQueryListEvent) => {
    if (event.matches) {
      closeMenu({ returnFocus: false });
    }
  };

  mediaQuery.addEventListener('change', handleMediaChange);
  window.addEventListener('unload', () => {
    mediaQuery.removeEventListener('change', handleMediaChange);
  });

  setMenuState();
  setButtonState();
};

const init = () => {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupHeaderMenu, { once: true });
  } else {
    setupHeaderMenu();
  }
};

if (typeof window !== 'undefined') {
  init();
}

export {};
