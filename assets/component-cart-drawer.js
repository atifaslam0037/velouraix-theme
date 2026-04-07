/**
 * @element cart-drawer-component
 * @description VELOURAIX slide-in cart drawer from the right.
 *
 * @fires cart:opened - When the drawer opens.
 * @fires cart:closed - When the drawer closes.
 * @listens data-cart-toggle  (click) → open / close
 * @listens data-cart-close   (click) → close
 * @listens cart:item-added          → open + refresh drawer HTML
 * @listens cart:updated             → sync badge count immediately
 * @listens cart:synced              → update count + subtotal labels
 */
class CartDrawerComponent extends HTMLElement {
  connectedCallback() {
    if (!this.querySelector('.cart-drawer__panel')) return;

    this._isOpen      = false;
    this._lastFocused = null;

    // Bound references for clean removal
    this._onToggle      = this._onToggle.bind(this);
    this._onClose       = this._onClose.bind(this);
    this._onKeydown     = this._onKeydown.bind(this);
    this._onItemAdded   = this._onItemAdded.bind(this);
    this._onCartUpdated = this._onCartUpdated.bind(this);
    this._onCartSynced  = this._onCartSynced.bind(this);

    document.querySelectorAll('[data-cart-toggle]').forEach((btn) =>
      btn.addEventListener('click', this._onToggle)
    );
    this.querySelectorAll('[data-cart-close]').forEach((el) =>
      el.addEventListener('click', this._onClose)
    );

    document.addEventListener('keydown',         this._onKeydown);
    document.addEventListener('cart:item-added', this._onItemAdded);
    document.addEventListener('cart:updated',    this._onCartUpdated);
    document.addEventListener('cart:synced',     this._onCartSynced);
  }

  disconnectedCallback() {
    document.querySelectorAll('[data-cart-toggle]').forEach((btn) =>
      btn.removeEventListener('click', this._onToggle)
    );
    this.querySelectorAll('[data-cart-close]').forEach((el) =>
      el.removeEventListener('click', this._onClose)
    );

    document.removeEventListener('keydown',         this._onKeydown);
    document.removeEventListener('cart:item-added', this._onItemAdded);
    document.removeEventListener('cart:updated',    this._onCartUpdated);
    document.removeEventListener('cart:synced',     this._onCartSynced);
  }

  // ── Event handlers ──────────────────────────────────────

  _onToggle(event) {
    event.preventDefault();
    this._isOpen ? this.close() : this.open();
  }

  _onClose(event) {
    event.preventDefault();
    this.close();
  }

  _onKeydown(event) {
    if (event.key === 'Escape' && this._isOpen) this.close();
  }

  async _onItemAdded() {
    this.open();
    await this._refreshDrawer();
  }

  async _onCartUpdated(event) {
    const count = event.detail?.cart?.item_count;
    if (typeof count !== 'undefined') this._updateCountBadge(count);
    await this._refreshDrawer();
  }

  _onCartSynced(event) {
    const { itemCount, formattedTotal } = event.detail || {};

    if (typeof itemCount !== 'undefined') this._updateCountBadge(itemCount);

    if (formattedTotal) {
      const el = this.querySelector('#cart-drawer-subtotal');
      if (el) el.textContent = formattedTotal;
    }
  }

  // ── Open / Close ─────────────────────────────────────────

  open() {
    this._lastFocused = document.activeElement;
    this._isOpen = true;

    this.setAttribute('open', '');
    this.setAttribute('aria-hidden', 'false');
    document.body.classList.add('overflow-hidden');

    document.querySelectorAll('[data-cart-toggle]').forEach((btn) =>
      btn.setAttribute('aria-expanded', 'true')
    );

    // Focus the close button after the slide-in transition completes
    requestAnimationFrame(() => {
      setTimeout(() => {
        this.querySelector('.cart-drawer__close')?.focus();
      }, 360);
    });

    if (window.trapFocus) window.trapFocus(this, this._lastFocused);

    document.dispatchEvent(new CustomEvent('cart:opened', { bubbles: true }));
  }

  close() {
    this._isOpen = false;

    this.removeAttribute('open');
    this.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('overflow-hidden');

    document.querySelectorAll('[data-cart-toggle]').forEach((btn) =>
      btn.setAttribute('aria-expanded', 'false')
    );

    if (window.removeTrapFocus) window.removeTrapFocus(this);

    if (this._lastFocused && typeof this._lastFocused.focus === 'function') {
      this._lastFocused.focus();
      this._lastFocused = null;
    }

    document.dispatchEvent(new CustomEvent('cart:closed', { bubbles: true }));
  }

  // ── Badge sync ───────────────────────────────────────────

  _updateCountBadge(itemCount) {
    const count = parseInt(itemCount, 10) || 0;

    // All cart-count elements on the page (header badge, mobile badge)
    ['cart-count', 'cart-count-mobile'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = count > 0 ? String(count) : '';
      el.classList.toggle('hidden', count === 0);
    });

    // Drawer count label
    const drawerCount = document.getElementById('cart-drawer-count');
    if (drawerCount) drawerCount.textContent = String(count);
  }

  // ── Drawer refresh (after add-to-cart from outside) ──────

  async _refreshDrawer() {
    try {
      // Fetch the header section which contains the drawer HTML
      const res  = await fetch(`${window.location.pathname}?sections=header`, {
        headers: { Accept: 'application/json' },
      });
      const json = await res.json();
      const html = json['header'];
      if (!html) return;

      const doc = new DOMParser().parseFromString(html, 'text/html');

      // Swap drawer body
      const freshBody = doc.getElementById('cart-drawer-items');
      const curBody   = this.querySelector('#cart-drawer-items');
      if (freshBody && curBody) {
        curBody.innerHTML = freshBody.innerHTML;
      }

      // Swap drawer footer
      const freshFoot = doc.getElementById('cart-drawer-footer');
      const curFoot   = this.querySelector('#cart-drawer-footer');
      if (freshFoot && curFoot) {
        curFoot.innerHTML  = freshFoot.innerHTML;
        // Sync footer visibility from fresh HTML
        const isHidden = freshFoot.classList.contains('is-hidden');
        curFoot.classList.toggle('is-hidden', isHidden);
      }

      // Re-attach close listeners to any newly inserted [data-cart-close] elements
      this.querySelectorAll('[data-cart-close]').forEach((el) =>
        el.addEventListener('click', this._onClose)
      );

    } catch (err) {
      console.error('[CartDrawer] Refresh failed:', err);
    }
  }
}

customElements.define('cart-drawer-component', CartDrawerComponent);
