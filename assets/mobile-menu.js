/**
 * @element mobile-menu-drawer
 * @description Full-screen mobile navigation modal. Editorial full-screen layout.
 *   Manages open/close state, nested accordion submenus, and delegates search
 *   trigger to the global search modal. Cart trigger in topbar respects cart_style
 *   (drawer triggers cart drawer; page link handled natively by HTML).
 * @fires modal:opened  - When the drawer opens. detail: { id: string }
 * @fires modal:closed  - When the drawer closes. detail: { id: string }
 * @listens search:opened - Closes the menu when search modal opens.
 */
class MobileMenuDrawer extends HTMLElement {
  connectedCallback() {
    this._toggles = document.querySelectorAll('[data-mobile-menu-toggle]');
    this._closes = this.querySelectorAll('[data-mobile-menu-close]');
    this._accordionButtons = this.querySelectorAll('[data-mobile-accordion]');
    this._searchTrigger = this.querySelector('[data-mobile-search-trigger]');

    // Guard: need at least one external toggle to be interactive.
    if (!this._toggles?.length) return;

    this._isOpen = false;
    this._lastFocused = null;

    this._onToggleClick = this._onToggleClick.bind(this);
    this._onCloseClick = this._onCloseClick.bind(this);
    this._onAccordionClick = this._onAccordionClick.bind(this);
    this._onKeydown = this._onKeydown.bind(this);
    this._onSearchTrigger = this._onSearchTrigger.bind(this);
    this._onSearchOpened = this._onSearchOpened.bind(this);
    this._onCartOpened = this._onCartOpened.bind(this);

    this._toggles.forEach(btn => btn.addEventListener('click', this._onToggleClick));
    this._closes.forEach(btn => btn.addEventListener('click', this._onCloseClick));
    this._accordionButtons.forEach(btn => btn.addEventListener('click', this._onAccordionClick));
    document.addEventListener('keydown', this._onKeydown);
    document.addEventListener('search:opened', this._onSearchOpened);
    document.addEventListener('cart:opened', this._onCartOpened);

    if (this._searchTrigger) {
      this._searchTrigger.addEventListener('click', this._onSearchTrigger);
    }
  }

  disconnectedCallback() {
    this._toggles?.forEach(btn => btn.removeEventListener('click', this._onToggleClick));
    this._closes?.forEach(btn => btn.removeEventListener('click', this._onCloseClick));
    this._accordionButtons?.forEach(btn => btn.removeEventListener('click', this._onAccordionClick));
    document.removeEventListener('keydown', this._onKeydown);
    document.removeEventListener('search:opened', this._onSearchOpened);
    document.removeEventListener('cart:opened', this._onCartOpened);
    if (this._searchTrigger) {
      this._searchTrigger.removeEventListener('click', this._onSearchTrigger);
    }
    if (window.removeTrapFocus) window.removeTrapFocus(this);
  }

  // ── Handlers ─────────────────────────────────────────────────

  _onToggleClick() {
    if (this._isOpen) {
      this._close();
    } else {
      this._open();
    }
  }

  _onCloseClick() {
    this._close();
  }

  _onAccordionClick(event) {
    const button = event.currentTarget;
    const targetId = button.dataset.mobileAccordion;
    const target = this.querySelector(`#${targetId}`);
    if (!target) return;

    const isExpanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!isExpanded));
    target.setAttribute('aria-hidden', String(isExpanded));
    target.classList.toggle('is-open', !isExpanded);
  }

  _onKeydown(event) {
    if (event.key === 'Escape' && this._isOpen) {
      this._close();
    }
  }

  _onSearchTrigger() {
    // Close menu silently then open the search modal.
    this._closeWithoutFocusReturn();
    const searchToggle = document.querySelector('[data-search-toggle]');
    if (searchToggle) searchToggle.click();
  }

  _onSearchOpened() {
    if (this._isOpen) this._closeWithoutFocusReturn();
  }

  _onCartOpened() {
    if (this._isOpen) this._closeWithoutFocusReturn();
  }

  // ── Open / Close ─────────────────────────────────────────────

  _open() {
    this._lastFocused = document.activeElement;
    this._isOpen = true;

    this.setAttribute('open', '');
    this.setAttribute('aria-hidden', 'false');
    document.body.classList.add('overflow-hidden');
    this._toggles.forEach(btn => btn.setAttribute('aria-expanded', 'true'));

    if (window.trapFocus) window.trapFocus(this, this._lastFocused);

    document.dispatchEvent(
      new CustomEvent('modal:opened', { bubbles: true, detail: { id: this.id } })
    );
  }

  _close() {
    this._isOpen = false;
    this.removeAttribute('open');
    this.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('overflow-hidden');
    this._toggles.forEach(btn => btn.setAttribute('aria-expanded', 'false'));

    if (window.removeTrapFocus) window.removeTrapFocus(this);

    if (this._lastFocused && typeof this._lastFocused.focus === 'function') {
      this._lastFocused.focus();
    }
    this._lastFocused = null;

    document.dispatchEvent(
      new CustomEvent('modal:closed', { bubbles: true, detail: { id: this.id } })
    );
  }

  _closeWithoutFocusReturn() {
    this._isOpen = false;
    this.removeAttribute('open');
    this.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('overflow-hidden');
    this._toggles.forEach(btn => btn.setAttribute('aria-expanded', 'false'));
    if (window.removeTrapFocus) window.removeTrapFocus(this);
    this._lastFocused = null;

    document.dispatchEvent(
      new CustomEvent('modal:closed', { bubbles: true, detail: { id: this.id } })
    );
  }
}

customElements.define('mobile-menu-drawer', MobileMenuDrawer);
