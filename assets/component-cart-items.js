/**
 * @element cart-items-component
 * @description VELOURAIX cart line-item manager. Handles all quantity changes
 *   and removals via the Shopify AJAX Cart API. After any mutation:
 *   1. POST /cart/change.js   → mutate the server cart
 *   2. GET  /cart.js          → authoritative item_count + total_price
 *   3. Sync every count badge + every subtotal/checkout-btn in the DOM instantly
 *   4. Re-render item list HTML via Shopify Section Rendering API
 *   5. Dispatch cart:synced so other components can react
 *
 * @fires cart:updated  { cart }                          — after /cart/change.js
 * @fires cart:synced   { itemCount, formattedTotal, cart } — after all DOM updates
 * @listens change  — on quantity inputs inside this element
 * @listens click   — on [data-cart-remove] buttons inside this element
 */
class CartItemsComponent extends HTMLElement {
  connectedCallback() {
    if (this._connected) return; // guard against double-connect
    this._connected = true;

    this._reqId = 0;
    this._onChangeBound = this._onChange.bind(this);
    this._onClickBound  = this._onClick.bind(this);

    // Debounce: wait 400ms after last change before firing the network call.
    // The immediate visual loading state is applied in the raw change listener.
    const debounce = window.themeDebounce ?? ((fn) => fn);
    this._debouncedChange = debounce(this._onChangeBound, 400);

    // Instant loading state — fires immediately, no debounce
    this.addEventListener('change', this._onInstantLoad.bind(this));
    this.addEventListener('change', this._debouncedChange);
    this.addEventListener('click',  this._onClickBound);

    this._ensureLiveRegion();
  }

  disconnectedCallback() {
    this.removeEventListener('change', this._debouncedChange);
    this.removeEventListener('click',  this._onClickBound);
  }

  // ─── Event handlers ──────────────────────────────────────

  _onInstantLoad(event) {
    const item = event.target.closest('[data-cart-item]');
    if (item) item.classList.add('is-loading');
  }

  _onClick(event) {
    const btn = event.target.closest('[data-cart-remove]');
    if (!btn) return;
    event.preventDefault();
    const item = btn.closest('[data-cart-item]');
    const line = item ? parseInt(item.dataset.line, 10) : null;
    if (!line) return;
    this._updateQuantity(line, 0, item?.dataset.cartItem);
  }

  _onChange(event) {
    const input = event.target.closest('input[type="number"]');
    if (!input) return;
    const item = input.closest('[data-cart-item]');
    if (!item) return;
    const qty = Math.max(0, parseInt(input.value, 10) || 0);
    const line = parseInt(item.dataset.line, 10);
    if (!line) return;

    // Sync paired input (mobile ↔ desktop mirror)
    const allInputs = item.querySelectorAll('input[type="number"]');
    allInputs.forEach((inp) => { if (inp !== input) inp.value = String(qty); });

    this._updateQuantity(line, qty, item.dataset.cartItem);
  }

  // ─── Core update ─────────────────────────────────────────

  async _updateQuantity(line, quantity, key) {
    const reqId  = ++this._reqId;
    const itemEl = key
      ? this.querySelector(`[data-cart-item="${key}"]`)
      : this.querySelector(`[data-line="${line}"]`);
    if (itemEl) itemEl.classList.add('is-loading');

    try {
      // POST to /cart/change.js — Shopify returns the FULL cart on success
      const res = await fetch('/cart/change.js', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body:    JSON.stringify({ line, quantity }),
      });
      const cart = await res.json();

      // Non-2xx or Shopify error body
      if (!res.ok || cart.status) {
        this._showError(key, cart.description || cart.message || 'Could not update cart.');
        if (itemEl) itemEl.classList.remove('is-loading');
        return;
      }

      if (reqId !== this._reqId) return; // stale — newer request in flight

      this._hideError(key);

      // Sync badges and totals immediately from the returned cart
      const itemCount      = parseInt(cart.item_count, 10) || 0;
      const formattedTotal = this._formatMoney(cart.total_price ?? 0);
      this._syncAllCountBadges(itemCount);
      this._syncAllSubtotals(formattedTotal, cart.total_price ?? 0);
      this._announce('Cart updated.');

      // Reconcile DOM directly — no section API round-trip needed
      this._reconcileItemsFromCart(cart);

      document.dispatchEvent(
        new CustomEvent('cart:synced', {
          bubbles: true,
          detail:  { itemCount, formattedTotal, cart },
        })
      );

    } catch (err) {
      console.error('[CartItems] Update failed:', err);
    } finally {
      const el = key ? (this.querySelector(`[data-cart-item="${key}"]`) ?? itemEl) : itemEl;
      if (el) el.classList.remove('is-loading');
    }
  }

  // ─── Direct DOM reconciliation from cart JSON ─────────────

  /**
   * Reconciles the rendered cart-item rows against the cart object
   * returned by /cart/change.js (which IS the full cart — no extra fetch needed).
   *
   * - Removes <li> rows for items no longer in the cart.
   * - Updates quantity inputs and line-price cells for remaining items.
   * - Refreshes data-line attributes so subsequent changes use correct line#.
   * - Shows empty state when cart is fully cleared.
   */
  _reconcileItemsFromCart(cart) {
    const remainingByKey = new Map(cart.items.map((item) => [String(item.key), item]));

    this.querySelectorAll('[data-cart-item]').forEach((el) => {
      const elKey = el.dataset.cartItem;
      if (!remainingByKey.has(elKey)) {
        el.remove();
        return;
      }

      // Update displayed quantity and line totals for items that remain
      const item = remainingByKey.get(elKey);
      el.querySelectorAll('input[type="number"]').forEach((inp) => {
        inp.value = String(item.quantity);
      });

      const lineTotal = document.getElementById(`cart-item-total-${elKey}`);
      if (lineTotal) lineTotal.textContent = this._formatMoney(item.final_line_price);

      const desktopTotal = document.getElementById(`cart-item-total-desktop-${elKey}`);
      if (desktopTotal) desktopTotal.textContent = this._formatMoney(item.final_line_price);
    });

    // Re-index data-line so subsequent mutations use accurate line numbers
    let idx = 1;
    this.querySelectorAll('[data-cart-item]').forEach((el) => {
      el.dataset.line = String(idx++);
    });

    // Empty-state handling
    if (cart.item_count === 0) {
      if (this.hasAttribute('data-drawer')) {
        const curBody = document.getElementById('cart-drawer-items');
        if (curBody) curBody.replaceChildren(this._buildDrawerEmptyNode());
        const footer = document.getElementById('cart-drawer-footer');
        if (footer) footer.classList.add('is-hidden');
      } else {
        const list = this.querySelector('.cart-items__list');
        if (list) list.remove();
        const cartPage = this.closest('.cart-page');
        if (cartPage) {
          cartPage.classList.add('cart-page--empty');
          const header = cartPage.closest('.main-cart')?.querySelector('.cart-page__table-header');
          if (header) header.style.display = 'none';
          const summary = cartPage.querySelector('.cart-page__summary');
          if (summary) summary.style.display = 'none';
        }
      }
    } else if (this.hasAttribute('data-drawer')) {
      const footer = document.getElementById('cart-drawer-footer');
      if (footer) footer.classList.remove('is-hidden');
    }
  }

  // ─── Sync helpers ─────────────────────────────────────────

  _syncAllCountBadges(itemCount) {
    const count = Number.isFinite(itemCount) ? itemCount : 0;

    // Header icon badges (desktop + mobile)
    ['cart-count', 'cart-count-mobile'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = count > 0 ? String(count) : '';
      el.classList.toggle('hidden', count === 0);
    });

    // Cart drawer header count
    const drawerCount = document.getElementById('cart-drawer-count');
    if (drawerCount) drawerCount.textContent = String(count);

    // Cart page title pill
    const pageCount = document.getElementById('cart-page-count');
    if (pageCount) {
      pageCount.textContent = String(count);
      pageCount.hidden = count === 0;
    }
  }

  _syncAllSubtotals(formattedTotal, rawTotal) {
    if (!formattedTotal) return;

    // Drawer subtotal text
    const drawerSub = document.getElementById('cart-drawer-subtotal');
    if (drawerSub) {
      drawerSub.textContent = formattedTotal;
      drawerSub.dataset.raw = String(rawTotal);
    }

    // Drawer checkout button — "CHECKOUT — Rs.X,XXX.XX"
    const drawerCheckout = document.getElementById('cart-drawer-checkout-btn');
    if (drawerCheckout) {
      const label = drawerCheckout.dataset.checkoutLabel ?? 'CHECKOUT —';
      drawerCheckout.textContent = `${label} ${formattedTotal}`;
    }

    // Cart page summary subtotal
    const pageSub = document.getElementById('cart-page-subtotal');
    if (pageSub) {
      pageSub.textContent = formattedTotal;
      pageSub.dataset.raw = String(rawTotal);
    }

    // Cart page checkout button — "CHECKOUT — Rs.X,XXX.XX"
    const pageCheckout = document.getElementById('cart-page-checkout-btn');
    if (pageCheckout) {
      const label = pageCheckout.dataset.checkoutLabel ?? 'CHECKOUT —';
      pageCheckout.textContent = `${label} ${formattedTotal}`;
    }
  }

  // ─── Money formatting ─────────────────────────────────────

  _formatMoney(cents) {
    // Prefer Shopify.formatMoney if available (most accurate)
    if (
      typeof window.Shopify !== 'undefined' &&
      typeof window.Shopify.formatMoney === 'function'
    ) {
      const drawerEl = document.querySelector('[data-money-format]');
      let format = drawerEl?.dataset?.moneyFormat ?? null;
      if (format) {
        try { format = JSON.parse(format); } catch (_) { /* use raw */ }
        return window.Shopify.formatMoney(cents, format);
      }
    }

    // Manual fallback using format string from data attribute
    const drawerEl = document.querySelector('[data-money-format]');
    let format = drawerEl?.dataset?.moneyFormat ?? null;
    if (format) {
      try { format = JSON.parse(format); } catch (_) { /* use raw */ }
    }

    const amount  = (cents / 100).toFixed(2);
    const [whole, decimal] = amount.split('.');
    const commaSep = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    if (!format) return `${commaSep}.${decimal}`;

    return format
      .replace(/\{\{\s*amount\s*\}\}/,                                amount)
      .replace(/\{\{\s*amount_no_decimals\s*\}\}/,                    whole)
      .replace(/\{\{\s*amount_with_comma_separator\s*\}\}/,           `${commaSep}.${decimal}`)
      .replace(/\{\{\s*amount_no_decimals_with_comma_separator\s*\}\}/, commaSep);
  }

  // ─── Error handling ───────────────────────────────────────

  _showError(key, msg) {
    const el = this.querySelector(`[id^="Line-item-error-${key}"]`);
    if (el) el.textContent = msg;
  }

  _hideError(key) {
    const el = this.querySelector(`[id^="Line-item-error-${key}"]`);
    if (el) el.textContent = '';
  }

  // ─── Accessibility ────────────────────────────────────────

  _announce(msg) {
    const lr = document.getElementById('cart-live-region');
    if (!lr) return;
    lr.textContent = '';
    requestAnimationFrame(() => { lr.textContent = msg; });
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

  // ─── Empty drawer helper ──────────────────────────────────

  _buildDrawerEmptyNode() {
    const wrap = document.createElement('div');
    wrap.className = 'cart-drawer__empty';

    const msg = document.createElement('p');
    msg.className   = 'cart-drawer__empty-msg';
    msg.textContent = window.theme?.translations?.cart_empty ?? 'Your cart is currently empty.';

    const link = document.createElement('a');
    link.className          = 'cart-drawer__empty-cta';
    link.dataset.cartClose  = '';
    link.href               = window.Shopify?.routes?.all_products_collection_url ?? '/';
    link.textContent        = (window.theme?.translations?.cart_continue_shopping ?? 'Continue shopping').toUpperCase();

    wrap.appendChild(msg);
    wrap.appendChild(link);
    return wrap;
  }
}

customElements.define('cart-items-component', CartItemsComponent);
