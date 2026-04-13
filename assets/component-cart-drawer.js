/**
 * component-cart-drawer.js
 * VELOURAIX — Cart drawer open/close + upsell carousel.
 *
 * CartDrawerComponent  — handles open / close / overlay / keyboard / badges
 * CartUpsellComponent  — fetches recommendations, falls back to /collections/all
 */

// ── Cart Drawer ──────────────────────────────────────────────────────────────

if (!customElements.get('cart-drawer-component')) {
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

      document.querySelectorAll('[data-cart-toggle]').forEach((btn) =>
        btn.addEventListener('click', this._onToggle)
      );

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

    // ─── Handlers ──────────────────────────────────────────

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
      if (window.theme?.settings?.cart_auto_open !== false) this.open();
      await this._refreshDrawerHTML();
    }

    _onCartSynced(event) {
      const { itemCount, formattedTotal } = event.detail || {};

      if (typeof itemCount !== 'undefined') {
        const dc = document.getElementById('cart-drawer-count');
        if (dc) dc.textContent = String(parseInt(itemCount, 10) || 0);
      }
      if (formattedTotal) {
        const sub = document.getElementById('cart-drawer-subtotal');
        if (sub) sub.textContent = formattedTotal;
      }
    }

    // ─── Open / Close ───────────────────────────────────────

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

    // ─── Full HTML refresh ──────────────────────────────────

    async _refreshDrawerHTML() {
      try {
        const res = await fetch(`/?sections=header&v=${Date.now()}`, {
          headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        });
        if (!res.ok) { await this._syncCountFromCart(); return; }

        const json = await res.json();
        const html = json['header'] || json['header-group'];
        if (!html) { await this._syncCountFromCart(); return; }

        const doc = new DOMParser().parseFromString(html, 'text/html');

        const swap = (id) => {
          const fresh = doc.getElementById(id);
          const cur   = document.getElementById(id);
          if (fresh && cur) cur.innerHTML = fresh.innerHTML;
        };

        swap('cart-drawer-items');
        swap('cart-drawer-footer');

        const freshFooter = doc.getElementById('cart-drawer-footer');
        const curFooter   = document.getElementById('cart-drawer-footer');
        if (freshFooter && curFooter) {
          curFooter.classList.toggle('is-hidden', freshFooter.classList.contains('is-hidden'));
        }

        const freshCount = doc.getElementById('cart-drawer-count');
        const curCount   = document.getElementById('cart-drawer-count');
        if (freshCount && curCount) curCount.textContent = freshCount.textContent;

        const freshSub = doc.getElementById('cart-drawer-subtotal');
        const curSub   = document.getElementById('cart-drawer-subtotal');
        if (freshSub && curSub) curSub.textContent = freshSub.textContent;

      } catch (err) {
        console.error('[CartDrawer] HTML refresh failed:', err);
        await this._syncCountFromCart();
      }
    }

    async _syncCountFromCart() {
      try {
        const res  = await fetch('/cart.js', { headers: { Accept: 'application/json' } });
        if (!res.ok) return;
        const cart  = await res.json();
        const count = parseInt(cart.item_count, 10) || 0;

        ['cart-count', 'cart-count-mobile'].forEach((id) => {
          const el = document.getElementById(id);
          if (!el) return;
          el.textContent = count > 0 ? String(count) : '';
          el.classList.toggle('hidden', count === 0);
        });

        const dc = document.getElementById('cart-drawer-count');
        if (dc) dc.textContent = String(count);
      } catch (_) { /* silent */ }
    }
  }

  customElements.define('cart-drawer-component', CartDrawerComponent);
}

// ── Cart Upsell ──────────────────────────────────────────────────────────────

if (!customElements.get('cart-upsell-component')) {
  class CartUpsellComponent extends HTMLElement {

    connectedCallback() {
      if (this._connected) return;
      this._connected = true;

      this._track   = this.querySelector('.cart-upsell__track');
      this._prevBtn = this.querySelector('[data-upsell-prev]');
      this._nextBtn = this.querySelector('[data-upsell-next]');
      this._productId = this.dataset.productId;
      this._limit     = parseInt(this.dataset.limit, 10) || 4;

      if (!this._track) return;

      this._prevBtn?.addEventListener('click', this._onPrev.bind(this));
      this._nextBtn?.addEventListener('click', this._onNext.bind(this));

      this._onCartSyncedBound = this._onCartSynced.bind(this);
      this._onClickBound      = this._onClick.bind(this);
      document.addEventListener('cart:synced', this._onCartSyncedBound);
      this.addEventListener('click', this._onClickBound);

      this._load(this._productId);
    }

    disconnectedCallback() {
      document.removeEventListener('cart:synced', this._onCartSyncedBound);
      this.removeEventListener('click', this._onClickBound);
    }

    _onPrev() {
      if (!this._track) return;
      const card  = this._track.querySelector('.cart-upsell__card');
      const width = card ? card.offsetWidth + 12 : 300;
      this._track.scrollBy({ left: -width, behavior: 'smooth' });
    }

    _onNext() {
      if (!this._track) return;
      const card  = this._track.querySelector('.cart-upsell__card');
      const width = card ? card.offsetWidth + 12 : 300;
      this._track.scrollBy({ left: width, behavior: 'smooth' });
    }

    _onCartSynced(event) {
      const cart = event.detail?.cart;
      if (!cart) return;
      const newId = String(cart.items?.[0]?.product_id ?? '0');
      if (newId && newId !== '0' && newId !== String(this._productId)) {
        this._productId = newId;
        this._load(newId);
      }
    }

    _onClick(event) {
      const btn = event.target.closest('[data-upsell-add]');
      if (!btn) return;
      const variantId = btn.dataset.upsellAdd;
      if (variantId) this._addToCart(variantId, btn);
    }

    async _load(productId) {
      if (!productId || String(productId) === '0') {
        this.hidden = true;
        return;
      }

      // Show skeleton while loading
      this._showSkeleton();

      // 1. Try Shopify recommendations
      try {
        const res = await fetch(
          `/recommendations/products.json?product_id=${productId}&limit=${this._limit}&intent=related`,
          { headers: { Accept: 'application/json' } }
        );
        if (res.ok) {
          const { products = [] } = await res.json();
          if (products.length) { this._render(products); return; }
        }
      } catch (_) { /* fall through */ }

      // 2. Fallback: best-selling from /collections/all
      try {
        const res = await fetch(
          `/collections/all/products.json?limit=12&sort_by=best-selling`,
          { headers: { Accept: 'application/json' } }
        );
        if (!res.ok) { this.hidden = true; return; }
        const { products = [] } = await res.json();
        const filtered = products
          .filter((p) => String(p.id) !== String(productId))
          .slice(0, this._limit);
        if (filtered.length) { this._render(filtered); } else { this.hidden = true; }
      } catch (_) {
        this.hidden = true;
      }
    }

    _showSkeleton() {
      if (!this._track) return;
      this.hidden = false;
      const frag = document.createDocumentFragment();
      for (let i = 0; i < 2; i++) {
        const skel = document.createElement('div');
        skel.className = 'cart-upsell__skeleton';
        skel.setAttribute('aria-hidden', 'true');
        skel.innerHTML = `
          <div class="cart-upsell__skel-img"></div>
          <div class="cart-upsell__skel-body">
            <div class="cart-upsell__skel-line"></div>
            <div class="cart-upsell__skel-line cart-upsell__skel-line--sm"></div>
            <div class="cart-upsell__skel-btn"></div>
          </div>`;
        frag.appendChild(skel);
      }
      this._track.replaceChildren(frag);
    }

    _render(products) {
      if (!this._track || !products.length) { this.hidden = true; return; }
      this.hidden = false;

      const frag = document.createDocumentFragment();

      products.forEach((product) => {
        const variant = product.variants?.[0];
        if (!variant) return;

        const variantId  = variant.id;
        const available  = variant.available;
        const compareAt  = variant.compare_at_price;
        const price      = variant.price;
        const imageUrl   = product.images?.[0]
          ? `${product.images[0].src}&width=240`
          : null;
        const imageAlt   = (product.images?.[0]?.alt ?? product.title).replace(/"/g, '&quot;');
        const productUrl = product.url ?? `/products/${product.handle}`;

        const card = document.createElement('div');
        card.className = 'cart-upsell__card';
        card.setAttribute('role', 'listitem');

        // ── Image ──
        const imgWrap = document.createElement('a');
        imgWrap.className = 'cart-upsell__img-wrap';
        imgWrap.href = productUrl;
        imgWrap.tabIndex = -1;
        imgWrap.setAttribute('aria-hidden', 'true');
        if (imageUrl) {
          const img = document.createElement('img');
          img.src     = imageUrl;
          img.alt     = imageAlt;
          img.width   = 120;
          img.height  = 160;
          img.loading = 'lazy';
          img.decoding = 'async';
          imgWrap.appendChild(img);
        }
        card.appendChild(imgWrap);

        // ── Info ──
        const info = document.createElement('div');
        info.className = 'cart-upsell__info';

        if (product.vendor) {
          const vendor = document.createElement('p');
          vendor.className = 'cart-upsell__vendor';
          vendor.textContent = product.vendor;
          info.appendChild(vendor);
        }

        const titleLink = document.createElement('a');
        titleLink.className = 'cart-upsell__title';
        titleLink.href = productUrl;
        titleLink.textContent = product.title;
        info.appendChild(titleLink);

        const priceRow = document.createElement('div');
        priceRow.className = 'cart-upsell__price-row';

        if (compareAt && compareAt > price) {
          const compareEl = document.createElement('s');
          compareEl.className = 'cart-upsell__compare';
          compareEl.textContent = this._formatMoney(compareAt);
          priceRow.appendChild(compareEl);
        }

        const priceEl = document.createElement('span');
        priceEl.className = 'cart-upsell__price';
        priceEl.textContent = this._formatMoney(price);
        priceRow.appendChild(priceEl);
        info.appendChild(priceRow);

        if (available) {
          const addBtn = document.createElement('button');
          addBtn.type = 'button';
          addBtn.className = 'cart-upsell__add';
          addBtn.dataset.upsellAdd = String(variantId);
          addBtn.textContent = 'ADD TO CART';
          info.appendChild(addBtn);
        } else {
          const soldOut = document.createElement('p');
          soldOut.className = 'cart-upsell__sold-out';
          soldOut.textContent = 'SOLD OUT';
          info.appendChild(soldOut);
        }

        card.appendChild(info);
        frag.appendChild(card);
      });

      this._track.replaceChildren(frag);
    }

    async _addToCart(variantId, btn) {
      btn.classList.add('is-loading');
      btn.textContent = '...';

      try {
        const res  = await fetch('/cart/add.js', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body:    JSON.stringify({ id: variantId, quantity: 1 }),
        });
        const data = await res.json();

        if (data.status === 422 || data.errors) {
          btn.textContent = 'UNAVAILABLE';
          return;
        }

        btn.textContent = '✓ ADDED';
        document.dispatchEvent(new CustomEvent('cart:updated', { bubbles: true, detail: { cart: data } }));

        const cartRes  = await fetch('/cart.js', { headers: { Accept: 'application/json' } });
        const cartData = await cartRes.json();
        document.dispatchEvent(new CustomEvent('cart:synced', {
          bubbles: true,
          detail: { itemCount: parseInt(cartData.item_count, 10) || 0, formattedTotal: null, cart: cartData },
        }));

      } catch (err) {
        console.error('[CartUpsell] Add to cart failed:', err);
        btn.textContent = 'ERROR';
      } finally {
        setTimeout(() => {
          btn.classList.remove('is-loading');
          btn.textContent = 'ADD TO CART';
        }, 2000);
      }
    }

    _formatMoney(cents) {
      const el = document.querySelector('[data-money-format]');
      let format = el?.dataset?.moneyFormat ?? null;
      if (format) { try { format = JSON.parse(format); } catch (_) { } }

      if (typeof window.Shopify?.formatMoney === 'function' && format) {
        return window.Shopify.formatMoney(cents, format);
      }

      const amount   = (cents / 100).toFixed(2);
      const [whole, decimal] = amount.split('.');
      const commaSep = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

      if (format && typeof format === 'string') {
        return format
          .replace(/\{\{\s*amount\s*\}\}/, amount)
          .replace(/\{\{\s*amount_no_decimals\s*\}\}/, whole)
          .replace(/\{\{\s*amount_with_comma_separator\s*\}\}/, `${commaSep}.${decimal}`)
          .replace(/\{\{\s*amount_no_decimals_with_comma_separator\s*\}\}/, commaSep);
      }

      return `Rs.${commaSep}.${decimal}`;
    }
  }

  customElements.define('cart-upsell-component', CartUpsellComponent);
}