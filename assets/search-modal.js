/**
 * SearchModal custom element.
 * Slide-in search panel from the right.
 *
 * Relies on:
 *  - [data-search-toggle]  — buttons anywhere in the page that open/toggle the modal
 *  - [data-search-close]   — elements inside (or outside) the modal that close it
 *  - [data-search-input]   — the text input to auto-focus on open (optional)
 *
 * Uses event delegation on `document` so it works even when toggle buttons
 * are rendered after this custom element connects (theme editor re-renders).
 *
 * Dispatches:
 *  - CustomEvent('search:opened') on document when opened
 *  - CustomEvent('search:closed') on document when closed
 *
 * Listens for:
 *  - CustomEvent('cart:opened') — closes the modal when the cart opens
 */
class SearchModal extends HTMLElement {
  connectedCallback() {
    this._isOpen      = false;
    this._lastFocused = null;

    // Bind handlers once so we can remove them cleanly
    this._onDocClick   = this._onDocClick.bind(this);
    this._onKeydown    = this._onKeydown.bind(this);
    this._onCartOpened = this._onCartOpened.bind(this);

    document.addEventListener('click',       this._onDocClick);
    document.addEventListener('keydown',     this._onKeydown);
    document.addEventListener('cart:opened', this._onCartOpened);
  }

  disconnectedCallback() {
    document.removeEventListener('click',       this._onDocClick);
    document.removeEventListener('keydown',     this._onKeydown);
    document.removeEventListener('cart:opened', this._onCartOpened);
    if (window.removeTrapFocus) window.removeTrapFocus(this);
  }

  // ── Lazy getters ─────────────────────────────────────────────

  get _input() {
    return this.querySelector('[data-search-input]');
  }

  // ── Handlers ─────────────────────────────────────────────────

  _onDocClick(event) {
    const toggle = event.target.closest('[data-search-toggle]');
    if (toggle) {
      this._isOpen ? this.close() : this.open();
      return;
    }

    const closer = event.target.closest('[data-search-close]');
    if (closer) {
      this.close();
    }
  }

  _onKeydown(event) {
    if (event.key === 'Escape' && this._isOpen) this.close();
  }

  _onCartOpened() {
    if (this._isOpen) this.close();
  }

  // ── Open / Close ─────────────────────────────────────────────

  open() {
    this._lastFocused = document.activeElement;
    this._isOpen      = true;

    this.setAttribute('open', '');
    this.setAttribute('aria-hidden', 'false');
    document.body.classList.add('overflow-hidden');

    // Update all toggle button ARIA state
    document.querySelectorAll('[data-search-toggle]').forEach(btn =>
      btn.setAttribute('aria-expanded', 'true')
    );

    // Trap focus — runs after the panel slides in so the input is visible
    setTimeout(() => {
      const input = this._input;
      if (input) {
        input.focus();
      } else if (window.trapFocus) {
        window.trapFocus(this, this._lastFocused);
      }
    }, 100);

    document.dispatchEvent(new CustomEvent('search:opened', { bubbles: true }));
  }

  close() {
    if (!this._isOpen) return;
    this._isOpen = false;

    this.removeAttribute('open');
    this.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('overflow-hidden');

    document.querySelectorAll('[data-search-toggle]').forEach(btn =>
      btn.setAttribute('aria-expanded', 'false')
    );

    if (window.removeTrapFocus) window.removeTrapFocus(this);

    document.dispatchEvent(new CustomEvent('search:closed', { bubbles: true }));

    // Return focus to the element that triggered the open
    const returnTo = this._lastFocused;
    this._lastFocused = null;
    if (returnTo && typeof returnTo.focus === 'function') {
      returnTo.focus();
    }
  }
}

customElements.define('search-modal', SearchModal);