/**
 * @element cart-upsell-component
 * @description Fetches Shopify native product recommendations for the first cart
 *   item and renders up to 4 product cards with prev/next scroll navigation and
 *   inline Add-to-Cart. Listens for cart:synced to refresh the product ID.
 *
 * @fires cart:updated { cart } — after a successful add-to-cart
 * @listens cart:synced — updates the recommendation product ID when cart changes
 *
 * Attributes:
 *   data-product-id           — Shopify product ID to base recommendations on
 *   data-recommendations-url  — Shopify routes.product_recommendations_url
 *   data-limit                — how many recs to request (default 4)
 */
class CartUpsellComponent extends HTMLElement {
  connectedCallback() {
    if (this._connected) return;
    this._connected = true;

    this._track        = this.querySelector('[data-upsell-prev]')?.closest('.cart-drawer__upsell-header')
      ? this.querySelector('.cart-drawer__upsell-track')
      : null;
    this._track        = this.querySelector('.cart-drawer__upsell-track');
    this._prevBtn      = this.querySelector('[data-upsell-prev]');
    this._nextBtn      = this.querySelector('[data-upsell-next]');
    this._productId    = this.dataset.productId;
    this._recsUrl      = this.dataset.recommendationsUrl;
    this._limit        = parseInt(this.dataset.limit, 10) || 4;

    if (!this._track || !this._recsUrl || !this._productId) return;

    // Navigation arrows
    this._onPrevBound = this._onPrev.bind(this);
    this._onNextBound = this._onNext.bind(this);
    if (this._prevBtn) this._prevBtn.addEventListener('click', this._onPrevBound);
    if (this._nextBtn) this._nextBtn.addEventListener('click', this._onNextBound);

    // Re-hydrate when cart changes (in case a different product is now first)
    this._onCartSyncedBound = this._onCartSynced.bind(this);
    document.addEventListener('cart:synced', this._onCartSyncedBound);

    // Handle inline add-to-cart clicks (event delegation on the track)
    this._onClickBound = this._onClick.bind(this);
    this.addEventListener('click', this._onClickBound);

    this._load(this._productId);
  }

  disconnectedCallback() {
    if (this._prevBtn) this._prevBtn.removeEventListener('click', this._onPrevBound);
    if (this._nextBtn) this._nextBtn.removeEventListener('click', this._onNextBound);
    document.removeEventListener('cart:synced', this._onCartSyncedBound);
    this.removeEventListener('click', this._onClickBound);
  }

  // ─── Event handlers ───────────────────────────────────────

  _onPrev() {
    if (!this._track) return;
    const cardWidth = this._track.querySelector('.cart-upsell-item')?.offsetWidth ?? 140;
    this._track.scrollBy({ left: -(cardWidth + 12), behavior: 'smooth' });
  }

  _onNext() {
    if (!this._track) return;
    const cardWidth = this._track.querySelector('.cart-upsell-item')?.offsetWidth ?? 140;
    this._track.scrollBy({ left: (cardWidth + 12), behavior: 'smooth' });
  }

  _onCartSynced(event) {
    const newCart = event.detail?.cart;
    if (!newCart) return;
    const newProductId = newCart.items?.[0]?.product_id;
    if (newProductId && String(newProductId) !== String(this._productId)) {
      this._productId = newProductId;
      this._load(this._productId);
    }
  }

  _onClick(event) {
    const btn = event.target.closest('[data-upsell-add]');
    if (!btn) return;
    const variantId = btn.dataset.upsellAdd;
    if (!variantId) return;
    this._addToCart(variantId, btn);
  }

  // ─── Fetch recommendations ────────────────────────────────

  async _load(productId) {
    if (!productId || productId === '0') {
      this.classList.add('is-empty');
      return;
    }

    try {
      const url  = `${this._recsUrl}?section_id=product-recommendations&product_id=${productId}&limit=${this._limit}`;
      const res  = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return;

      const json = await res.json();

      // Shopify returns a JSON object with a "products" array
      const products = json.products ?? [];
      this._render(products);
    } catch (err) {
      console.error('[CartUpsell] Failed to load recommendations:', err);
      this.classList.add('is-empty');
    }
  }

  // ─── Render card HTML ─────────────────────────────────────

  _render(products) {
    if (!this._track) return;

    if (!products.length) {
      this.classList.add('is-empty');
      return;
    }

    this.classList.remove('is-empty');

    // Build cards using DOM methods (never innerHTML with dynamic data)
    const frag = document.createDocumentFragment();

    products.forEach((product) => {
      const variant       = product.variants?.[0];
      if (!variant) return;

      const variantId     = variant.id;
      const available     = variant.available;
      const price         = this._formatMoney(variant.price);
      const imageUrl      = product.images?.[0]
        ? `${product.images[0].src}&width=280`
        : null;
      const imageWidth    = product.images?.[0]?.width  ?? 280;
      const imageHeight   = product.images?.[0]?.height ?? 373;
      const imageAlt      = (product.images?.[0]?.alt ?? product.title).replace(/"/g, '&quot;');
      const productUrl    = product.url ?? `/products/${product.handle}`;

      // Card wrapper
      const card = document.createElement('div');
      card.className = 'cart-upsell-item';
      card.setAttribute('role', 'listitem');

      // Link + image
      const link = document.createElement('a');
      link.className = 'cart-upsell-item__link';
      link.href = productUrl;

      const imageWrap = document.createElement('span');
      imageWrap.className = 'cart-upsell-item__image-wrap';

      if (imageUrl) {
        const img = document.createElement('img');
        img.className     = 'cart-upsell-item__img';
        img.src           = imageUrl;
        img.alt           = imageAlt;
        img.width         = imageWidth;
        img.height        = imageHeight;
        img.loading       = 'lazy';
        img.decoding      = 'async';
        imageWrap.appendChild(img);
      }
      link.appendChild(imageWrap);

      // Title
      const title = document.createElement('span');
      title.className = 'cart-upsell-item__title';
      title.textContent = product.title;
      link.appendChild(title);

      // Price
      const priceEl = document.createElement('span');
      priceEl.className = 'cart-upsell-item__price';
      priceEl.textContent = price;
      link.appendChild(priceEl);

      card.appendChild(link);

      // Add to cart button
      if (available) {
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'cart-upsell-item__add';
        addBtn.dataset.upsellAdd = String(variantId);
        addBtn.textContent = 'Add to cart';
        card.appendChild(addBtn);
      }

      frag.appendChild(card);
    });

    this._track.replaceChildren(frag);
  }

  // ─── Add to cart ──────────────────────────────────────────

  async _addToCart(variantId, btn) {
    btn.classList.add('is-loading');
    btn.textContent = '...';

    try {
      const res = await fetch('/cart/add.js', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body:    JSON.stringify({ id: variantId, quantity: 1 }),
      });
      const cart = await res.json();

      if (cart.status === 422 || cart.errors) {
        btn.textContent = 'Unavailable';
        return;
      }

      btn.textContent = '✓ Added';

      document.dispatchEvent(
        new CustomEvent('cart:updated', { bubbles: true, detail: { cart } })
      );

      // Reload the cart totals
      const cartRes  = await fetch('/cart.js', { headers: { Accept: 'application/json' } });
      const cartData = await cartRes.json();
      document.dispatchEvent(
        new CustomEvent('cart:synced', {
          bubbles: true,
          detail:  {
            itemCount:      parseInt(cartData.item_count, 10) || 0,
            formattedTotal: null,
            cart:          cartData,
          },
        })
      );

    } catch (err) {
      console.error('[CartUpsell] Add to cart failed:', err);
      btn.textContent = 'Error';
    } finally {
      setTimeout(() => {
        btn.classList.remove('is-loading');
        btn.textContent = 'Add to cart';
      }, 2000);
    }
  }

  // ─── Money format ─────────────────────────────────────────

  _formatMoney(cents) {
    const el = document.querySelector('[data-money-format]');
    let format = el?.dataset?.moneyFormat ?? null;
    if (format) {
      try { format = JSON.parse(format); } catch (_) { /* use raw */ }
    }

    if (
      typeof window.Shopify !== 'undefined' &&
      typeof window.Shopify.formatMoney === 'function' &&
      format
    ) {
      return window.Shopify.formatMoney(cents, format);
    }

    const amount   = (cents / 100).toFixed(2);
    const [whole, decimal] = amount.split('.');
    const commaSep = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (!format) return `${commaSep}.${decimal}`;

    return format
      .replace(/\{\{\s*amount\s*\}\}/,            amount)
      .replace(/\{\{\s*amount_no_decimals\s*\}\}/, whole)
      .replace(/\{\{\s*amount_with_comma_separator\s*\}\}/, `${commaSep}.${decimal}`)
      .replace(/\{\{\s*amount_no_decimals_with_comma_separator\s*\}\}/, commaSep);
  }
}

customElements.define('cart-upsell-component', CartUpsellComponent);
