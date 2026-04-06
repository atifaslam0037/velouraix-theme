/**
 * SearchModal custom element.
 * Full-screen search overlay with slide-down animation.
 * Uses visibility-based transitions for smooth CSS animations.
 */
class SearchModal extends HTMLElement {
  connectedCallback() {
    if (!this.querySelector('[data-search-input]')) {
      return;
    }

    this._input = this.querySelector('[data-search-input]');
    this._toggles = document.querySelectorAll('[data-search-toggle]');
    this._closes = this.querySelectorAll('[data-search-close]');
    this._isOpen = false;
    this._lastFocused = null;
    this._onToggleClick = this._onToggleClick.bind(this);
    this._onCloseClick = this._onCloseClick.bind(this);
    this._onKeydown = this._onKeydown.bind(this);

    this._toggles.forEach(btn => btn.addEventListener('click', this._onToggleClick));
    this._closes.forEach(el => el.addEventListener('click', this._onCloseClick));
    document.addEventListener('keydown', this._onKeydown);
  }

  disconnectedCallback() {
    this._toggles?.forEach(btn => btn.removeEventListener('click', this._onToggleClick));
    this._closes?.forEach(el => el.removeEventListener('click', this._onCloseClick));
    document.removeEventListener('keydown', this._onKeydown);
    if (window.removeTrapFocus) {
      window.removeTrapFocus(this);
    }
  }

  _onToggleClick() {
    this.open();
  }

  _onCloseClick() {
    this.close();
  }

  _onKeydown(event) {
    if (event.key === 'Escape' && this._isOpen) {
      this.close();
    }
  }

  open() {
    this._lastFocused = document.activeElement;
    this._isOpen = true;

    this.setAttribute('open', '');
    this.setAttribute('aria-hidden', 'false');
    document.body.classList.add('overflow-hidden');

    this._toggles.forEach(btn => btn.setAttribute('aria-expanded', 'true'));
    if (window.trapFocus) {
      window.trapFocus(this, this._lastFocused);
    }
    document.dispatchEvent(new CustomEvent('search:opened', { bubbles: true }));

    // Focus input after panel transition
    setTimeout(() => {
      if (this._input) this._input.focus();
    }, 80);
  }

  close() {
    this._isOpen = false;

    this.removeAttribute('open');
    this.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('overflow-hidden');

    this._toggles.forEach(btn => btn.setAttribute('aria-expanded', 'false'));
    if (window.removeTrapFocus) {
      window.removeTrapFocus(this);
      this._lastFocused = null;
    }
    document.dispatchEvent(new CustomEvent('search:closed', { bubbles: true }));

    // Return focus
    if (this._lastFocused) {
      this._lastFocused.focus();
      this._lastFocused = null;
    }
  }
}

customElements.define('search-modal', SearchModal);