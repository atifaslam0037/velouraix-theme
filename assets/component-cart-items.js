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
    this._updateQuantity(btn.dataset.cartRemove, 0);
  }

  _onChange(event) {
    const input = event.target.closest('input[type="number"]');
    if (!input) return;
    const item = input.closest('[data-cart-item]');
    if (!item) return;
    const qty = Math.max(0, parseInt(input.value, 10) || 0);
    this._updateQuantity(item.dataset.cartItem, qty);
  }

  // ─── Core update ─────────────────────────────────────────

  async _updateQuantity(key, quantity) {
    const reqId  = ++this._reqId;
    const itemEl = this.querySelector(`[data-cart-item="${key}"]`);
    if (itemEl) itemEl.classList.add('is-loading');

    try {
      // ── 1. Mutate the server cart ──
      const changeRes = await fetch('/cart/change.js', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body:    JSON.stringify({ id: key, quantity }),
      });
      const changeData = await changeRes.json();

      if (changeData.status === 422 || changeData.errors || changeData.description) {
        this._showError(key, changeData.description || changeData.message || 'Could not update cart.');
        if (itemEl) itemEl.classList.remove('is-loading');
        return;
      }
      this._hideError(key);

      document.dispatchEvent(
        new CustomEvent('cart:updated', { bubbles: true, detail: { cart: changeData } })
      );

      // ── 2. Fetch source-of-truth from /cart.js ──
      const cartRes  = await fetch('/cart.js', { headers: { Accept: 'application/json' } });
      const cartData = await cartRes.json();

      // If a newer request has already started, abort to avoid stale UI updates
      if (reqId !== this._reqId) return;

      const itemCount      = parseInt(cartData.item_count, 10) || 0;
      const formattedTotal = this._formatMoney(cartData.total_price ?? 0);

      // ── 3. Immediately sync ALL count badges and subtotals ──
      this._syncAllCountBadges(itemCount);
      this._syncAllSubtotals(formattedTotal, cartData.total_price ?? 0);
      this._announce('Cart updated.');

      // ── 4. Re-render item list HTML via Section Rendering API ──
      await this._reRenderItems(itemCount);

      document.dispatchEvent(
        new CustomEvent('cart:synced', {
          bubbles: true,
          detail:  { itemCount, formattedTotal, cart: cartData },
        })
      );

    } catch (err) {
      console.error('[CartItems] Update failed:', err);
    } finally {
      // Always remove loading state from the item — use fresh querySelector
      // in case the element was replaced by re-render
      const el = this.querySelector(`[data-cart-item="${key}"]`) ?? itemEl;
      if (el) el.classList.remove('is-loading');
    }
  }

  // ─── Section re-render ────────────────────────────────────

  async _reRenderItems(itemCount) {
    const parse = (html) => new DOMParser().parseFromString(html, 'text/html');
    const isDrawer = this.hasAttribute('data-drawer');

    try {
      if (isDrawer) {
        // ── Drawer: re-fetch header section ──
        const res  = await fetch(`${window.location.pathname}?sections=header`, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return;

        const json = await res.json();
        const html = json['header'] ?? json['header-group'] ?? null;
        if (!html) return;

        const doc     = parse(html);
        const curBody = document.getElementById('cart-drawer-items');
        if (!curBody) return;

        if (itemCount === 0) {
          curBody.replaceChildren(this._buildDrawerEmptyNode());
        } else {
          const freshComp = doc.querySelector('cart-items-component[data-drawer]');
          if (freshComp) {
            // Replace children of THIS component, preserving the wrapper and its CSS classes
            this.innerHTML = '';
            Array.from(freshComp.childNodes)
              .forEach((n) => this.appendChild(n.cloneNode(true)));
          }
        }

        const drawerFooter = document.getElementById('cart-drawer-footer');
        if (drawerFooter) drawerFooter.classList.toggle('is-hidden', itemCount === 0);

      } else {
        // ── Cart page: Shopify Sections API ──
        // Walk up to the shopify-section wrapper to get the real dynamic ID
        const sectionEl = this.closest('[id^="shopify-section-"]');
        const sectionId = sectionEl
          ? sectionEl.id.replace('shopify-section-', '')
          : 'main-cart';

        const res = await fetch(`/cart?sections=${encodeURIComponent(sectionId)}`, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return;

        const json = await res.json();
        const html = json[sectionId];
        if (!html) return;

        this._swapCartPageItems(parse(html), itemCount);
      }

    } catch (err) {
      console.error('[CartItems] Re-render failed:', err);
    }
  }

  /**
   * Swaps cart item rows on the cart page after a re-render.
   * We replace only the <ul> list inside this component so the component
   * element itself is not removed (its event listeners remain intact).
   */
  _swapCartPageItems(doc, itemCount) {
    if (itemCount === 0) {
      // Swap the entire page region to empty state
      const freshPage = doc.querySelector('.cart-page');
      const curPage   = this.closest('.cart-page');
      if (freshPage && curPage) curPage.replaceWith(freshPage.cloneNode(true));
      return;
    }

    const freshList = doc.querySelector('.cart-items__list');
    // Target the list inside this specific component (not the drawer's list)
    const curList = this.querySelector('.cart-items__list');
    if (freshList && curList) curList.replaceWith(freshList.cloneNode(true));
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
