/**
 * @element cart-drawer-component
 * @description VELOURAIX slide-in cart drawer.
 *   Intentionally lean — open/close/badge only.
 *   All mutation logic lives in CartItemsComponent.
 *
 * @fires cart:opened
 * @fires cart:closed
 * @listens [data-cart-toggle] click → open / close
 * @listens [data-cart-close]  click → close (delegated)
 * @listens Escape key               → close when open
 * @listens cart:item-added          → open + full HTML refresh
 * @listens cart:synced              → update count badge + subtotal
 */
class CartDrawerComponent extends HTMLElement {
  connectedCallback() {
    if (!this.querySelector('.cart-drawer__panel')) return;

    this._isOpen      = false;
    this._lastFocused = null;

    this._onToggle         = this._onToggle.bind(this);
    this._onKeydown        = this._onKeydown.bind(this);
    this._onItemAdded      = this._onItemAdded.bind(this);
    this._onCartSynced     = this._onCartSynced.bind(this);
    this._onDelegatedClick = this._onDelegatedClick.bind(this);

    // Toggle buttons (header cart icon etc.)
    document.querySelectorAll('[data-cart-toggle]').forEach((btn) =>
      btn.addEventListener('click', this._onToggle)
    );

    // Delegated close: catches data-cart-close inside the drawer (incl. dynamically added)
    this.addEventListener('click', this._onDelegatedClick);

    document.addEventListener('keydown',         this._onKeydown);
    document.addEventListener('cart:item-added', this._onItemAdded);
    document.addEventListener('cart:synced',     this._onCartSynced);
  }

  disconnectedCallback() {
    document.querySelectorAll('[data-cart-toggle]').forEach((btn) =>
      btn.removeEventListener('click', this._onToggle)
    );
    this.removeEventListener('click', this._onDelegatedClick);
    document.removeEventListener('keydown',         this._onKeydown);
    document.removeEventListener('cart:item-added', this._onItemAdded);
    document.removeEventListener('cart:synced',     this._onCartSynced);
    if (window.removeTrapFocus) window.removeTrapFocus(this);
  }

  // ─── Handlers ────────────────────────────────────────────

  _onToggle(event) {
    event.preventDefault();
    this._isOpen ? this.close() : this.open();
  }

  _onDelegatedClick(event) {
    if (event.target.closest('[data-cart-close]')) {
      event.preventDefault();
      this.close();
    }
  }

  _onKeydown(event) {
    if (event.key === 'Escape' && this._isOpen) this.close();
  }

  async _onItemAdded() {
    this.open();
    await this._refreshDrawerHTML();
  }

  /**
   * Cart:synced is fired by CartItemsComponent after it fetches /cart.js.
   * The count badges and subtotals are already updated by _syncAllCountBadges /
   * _syncAllSubtotals inside CartItemsComponent. We only need to handle
   * anything that's drawer-specific and NOT covered by those helpers.
   */
  _onCartSynced(event) {
    const { itemCount, formattedTotal } = event.detail || {};

    // Belt-and-suspenders: ensure the drawer count is current
    if (typeof itemCount !== 'undefined') {
      const dc = document.getElementById('cart-drawer-count');
      if (dc) dc.textContent = String(parseInt(itemCount, 10) || 0);
    }

    // Belt-and-suspenders: ensure the drawer subtotal is current
    if (formattedTotal) {
      const sub = document.getElementById('cart-drawer-subtotal');
      if (sub) sub.textContent = formattedTotal;
    }
  }

  // ─── Open / Close ─────────────────────────────────────────

  open() {
    this._lastFocused = document.activeElement;
    this._isOpen      = true;

    this.setAttribute('open', '');
    this.setAttribute('aria-hidden', 'false');
    document.body.classList.add('overflow-hidden');

    document.querySelectorAll('[data-cart-toggle]').forEach((btn) =>
      btn.setAttribute('aria-expanded', 'true')
    );

    if (window.trapFocus) window.trapFocus(this, this._lastFocused);

    requestAnimationFrame(() => {
      setTimeout(() => this.querySelector('.cart-drawer__close')?.focus(), 360);
    });

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

    if (this._lastFocused?.focus) {
      this._lastFocused.focus();
      this._lastFocused = null;
    }

    document.dispatchEvent(new CustomEvent('cart:closed', { bubbles: true }));
  }

  // ─── Full HTML refresh (add-to-cart from product page) ───

  async _refreshDrawerHTML() {
    try {
      const res  = await fetch(`${window.location.pathname}?sections=header`, {
        headers: { Accept: 'application/json' },
      });
      const json = await res.json();
      const html = json['header'] || json['header-group'];
      if (!html) return;

      const doc = new DOMParser().parseFromString(html, 'text/html');

      const swap = (freshId, curId, toggleHiddenClass) => {
        const fresh = doc.getElementById(freshId);
        const cur   = this.querySelector(`#${curId}`);
        if (!fresh || !cur) return;
        const frag = document.createDocumentFragment();
        Array.from(fresh.childNodes).forEach((n) => frag.appendChild(n.cloneNode(true)));
        cur.replaceChildren(frag);
        if (toggleHiddenClass) {
          cur.classList.toggle('is-hidden', fresh.classList.contains('is-hidden'));
        }
      };

      swap('cart-drawer-items',  'cart-drawer-items',  false);
      swap('cart-drawer-footer', 'cart-drawer-footer', true);

      // Sync count badge from the fresh header HTML
      const freshCount = doc.getElementById('cart-drawer-count');
      const curCount   = document.getElementById('cart-drawer-count');
      if (freshCount && curCount) curCount.textContent = freshCount.textContent;

    } catch (err) {
      console.error('[CartDrawer] HTML refresh failed:', err);
    }
  }
}

customElements.define('cart-drawer-component', CartDrawerComponent);
