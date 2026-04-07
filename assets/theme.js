/**
 * Global theme utilities.
 * Provides focus trap helpers for dialogs/drawers and a debounce helper.
 */
(() => {
  const FOCUSABLE_SELECTOR = [
    'a[href]',
    'area[href]',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'button:not([disabled])',
    'iframe',
    'object',
    'embed',
    '[contenteditable]',
    '[tabindex]:not([tabindex^="-"])'
  ].join(',');

  function getFocusableElements(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
      element => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true'
    );
  }

  function removeTrapFocus(container) {
    if (!container || typeof container._removeTrap !== 'function') return;
    container._removeTrap();
    container._removeTrap = null;
  }

  function trapFocus(container, returnFocusTo) {
    if (!container) return;

    removeTrapFocus(container);

    const focusable = getFocusableElements(container);
    const first = focusable[0] || container;
    const last = focusable[focusable.length - 1] || container;

    const onKeydown = event => {
      if (event.key !== 'Tab') return;

      if (focusable.length <= 1) {
        event.preventDefault();
        first.focus();
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', onKeydown);
    first.focus();

    container._removeTrap = () => {
      container.removeEventListener('keydown', onKeydown);
      if (returnFocusTo && typeof returnFocusTo.focus === 'function') {
        returnFocusTo.focus();
      }
    };
  }

  function debounce(callback, delay = 200) {
    let timeoutId;
    return (...args) => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => callback(...args), delay);
    };
  }

  window.trapFocus = trapFocus;
  window.removeTrapFocus = removeTrapFocus;
  window.themeDebounce = debounce;
})();
