/**
 * @element cart-items-component
 * @description VELOURAIX cart line-item manager.
 *   Handles quantity changes and item removal for both the cart drawer
 *   and the cart page. After every mutation:
 *     1. Calls POST /cart/change.js
 *     2. Dispatches 'cart:updated' with full cart JSON
 *     3. Fetches /cart?section_id=main-cart for fresh Liquid HTML
 *     4. On cart page → morphs own innerHTML with fresh content
 *     5. Always → syncs all global badges, drawer count, drawer subtotal
 *
 * @fires cart:updated - detail: { cart } — after every /cart/change.js call
 * @fires cart:synced  - detail: { itemCount, formattedTotal } — after re-render
 */
class CartItemsComponent extends HTMLElement {
  connectedCallback() {
    // Guard: need the list to be interactive
    if (!this.querySelector('.cart-items__list, .cart-item')) return;

    this._onChangeBound = this._onChange.bind(this);
    this._onClickBound  = this._onClick.bind(this);

    // Debounce quantity input changes so rapid +/- taps batch together
    this._debouncedChange = window.themeDebounce
      ? window.themeDebounce(this._onChangeBound, 400)
      : this._onChangeBound;

    this.addEventListener('change', this._debouncedChange);
    this.addEventListener('click', this._onClickBound);

    // Inject aria-live region once per page for screen-reader announcements
    this._ensureLiveRegion();
  }

  disconnectedCallback() {
    this.removeEventListener('change', this._debouncedChange);
    this.removeEventListener('click', this._onClickBound);
  }

  // ── Event handlers ──────────────────────────────────────

  _onClick(event) {
    const removeBtn = event.target.closest('[data-cart-remove]');
    if (!removeBtn) return;
    event.preventDefault();
    this._updateQuantity(removeBtn.dataset.cartRemove, 0);
  }

  _onChange(event) {
    const input = event.target.closest('input[type="number"]');
    if (!input) return;
    const item = input.closest('[data-cart-item]');
    if (!item) return;
    const qty = Math.max(0, parseInt(input.value, 10) || 0);
    this._updateQuantity(item.dataset.cartItem, qty);
  }

  // ── Core update flow ────────────────────────────────────

  async _updateQuantity(key, quantity) {
    const itemEl = this.querySelector(`[data-cart-item="${key}"]`);
    if (itemEl) itemEl.classList.add('is-loading');

    try {
      const res = await fetch('/cart/change.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ id: key, quantity }),
      });

      const cart = await res.json();

      // Handle validation errors (e.g. oversell)
      if (cart.status === 422 || cart.errors || cart.description) {
        this._showError(key, cart.description || cart.message || 'Could not update cart.');
        if (itemEl) itemEl.classList.remove('is-loading');
        return;
      }

      this._hideError(key);
      this._announce('Cart updated.');

      document.dispatchEvent(
        new CustomEvent('cart:updated', { bubbles: true, detail: { cart } })
      );

      await this._reRender();

    } catch (err) {
      console.error('[CartItems] Update failed:', err);
      if (itemEl) itemEl.classList.remove('is-loading');
    }
  }

  // ── Re-render from server ────────────────────────────────

  async _reRender() {
    try {
      const res = await fetch('/cart?section_id=main-cart');
      if (!res.ok) return;

      const html = await res.text();
      const doc  = new DOMParser().parseFromString(html, 'text/html');

      // Only swap own content when we're on the cart page (not inside the drawer)
      if (!this.hasAttribute('data-drawer')) {
        const fresh = doc.querySelector('cart-items-component');
        if (fresh) {
          this.innerHTML = fresh.innerHTML;
        }
      }

      this._syncGlobalUI(doc);

    } catch (err) {
      console.error('[CartItems] Re-render failed:', err);
    }
  }

  // ── Global UI sync ───────────────────────────────────────

  _syncGlobalUI(doc) {
    // Read count + subtotal from the freshly rendered section
    const freshCount    = doc.querySelector('#cart-page-count');
    const freshSubtotal = doc.querySelector('#cart-page-subtotal');

    const itemCount      = freshCount    ? parseInt(freshCount.textContent.trim(), 10) || 0 : 0;
    const formattedTotal = freshSubtotal ? freshSubtotal.textContent.trim() : '';

    // ── Header badge ──
    ['cart-count', 'cart-count-mobile'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = itemCount > 0 ? String(itemCount) : '';
      el.classList.toggle('hidden', itemCount === 0);
    });

    // ── Drawer count label ──
    const drawerCount = document.getElementById('cart-drawer-count');
    if (drawerCount) drawerCount.textContent = String(itemCount);

    // ── Drawer subtotal ──
    if (formattedTotal) {
      const drawerSub = document.getElementById('cart-drawer-subtotal');
      if (drawerSub) drawerSub.textContent = formattedTotal;
    }

    // ── Drawer footer visibility ──
    const drawerFooter = document.getElementById('cart-drawer-footer');
    if (drawerFooter) {
      drawerFooter.classList.toggle('is-hidden', itemCount === 0);
    }

    // ── Drawer body: inject empty state when cart empties ──
    if (itemCount === 0) {
      const drawerBody = document.getElementById('cart-drawer-items');
      if (drawerBody && !drawerBody.querySelector('.cart-drawer__empty')) {
        drawerBody.innerHTML = `
          <div class="cart-drawer__empty">
            <p class="cart-drawer__empty-msg">${this._emptyText()}</p>
            <a href="${window.Shopify?.routes?.all_products_collection_url || '/collections/all'}"
               class="cart-drawer__empty-link" data-cart-close>
              Continue shopping
            </a>
          </div>`;
        // Re-attach close listener to the new link
        const newLink = drawerBody.querySelector('[data-cart-close]');
        if (newLink) {
          newLink.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelector('cart-drawer-component')?.close?.();
          });
        }
      }
    }

    document.dispatchEvent(
      new CustomEvent('cart:synced', {
        bubbles: true,
        detail: { itemCount, formattedTotal },
      })
    );
  }

  // ── Helpers ─────────────────────────────────────────────

  _emptyText() {
    return window.theme?.translations?.cart_empty || 'Your cart is empty';
  }

  _showError(key, message) {
    const el = this.querySelector(`#Line-item-error-${key}`);
    if (el) el.textContent = message;
  }

  _hideError(key) {
    const el = this.querySelector(`#Line-item-error-${key}`);
    if (el) el.textContent = '';
  }

  _announce(message) {
    const lr = document.getElementById('cart-live-region');
    if (lr) {
      lr.textContent = '';
      // Tiny timeout ensures the live region re-announces even same message
      requestAnimationFrame(() => { lr.textContent = message; });
    }
  }

  _ensureLiveRegion() {
    if (document.getElementById('cart-live-region')) return;
    const lr = document.createElement('span');
    lr.id = 'cart-live-region';
    lr.className = 'visually-hidden';
    lr.setAttribute('aria-live', 'polite');
    lr.setAttribute('aria-atomic', 'true');
    document.body.appendChild(lr);
  }
}

customElements.define('cart-items-component', CartItemsComponent);
