/**
 * CartDrawer custom element.
 * Slide-in cart drawer from right with overlay.
 * Handles quantity changes, item removal, and live content refresh.
 */
class CartDrawer extends HTMLElement {
  connectedCallback() {
    if (!this.querySelector('#cart-drawer-items')) {
      return;
    }

    this._toggles = document.querySelectorAll('[data-cart-toggle]');
    this._closes = this.querySelectorAll('[data-cart-close]');
    this._isOpen = false;
    this._lastFocused = null;
    this._onToggleClick = this._onToggleClick.bind(this);
    this._onCloseClick = this._onCloseClick.bind(this);
    this._onKeydown = this._onKeydown.bind(this);
    this._onClick = this._onClick.bind(this);
    this._onCartItemAdded = this._onCartItemAdded.bind(this);

    this._toggles.forEach(btn => btn.addEventListener('click', this._onToggleClick));
    this._closes.forEach(el => el.addEventListener('click', this._onCloseClick));

    document.addEventListener('keydown', this._onKeydown);

    // Quantity change & remove via event delegation
    this.addEventListener('click', this._onClick);

    // Listen for add-to-cart events from other sections
    document.addEventListener('cart:item-added', this._onCartItemAdded);
  }

  disconnectedCallback() {
    this._toggles?.forEach(btn => btn.removeEventListener('click', this._onToggleClick));
    this._closes?.forEach(el => el.removeEventListener('click', this._onCloseClick));
    document.removeEventListener('keydown', this._onKeydown);
    this.removeEventListener('click', this._onClick);
    document.removeEventListener('cart:item-added', this._onCartItemAdded);
  }

  _onToggleClick(event) {
    event.preventDefault();
    this.open();
  }

  _onCloseClick(event) {
    event.preventDefault();
    this.close();
  }

  _onKeydown(event) {
    if (event.key === 'Escape' && this._isOpen) {
      this.close();
    }
  }

  _onClick(event) {
    const qtyBtn = event.target.closest('[data-cart-qty-change]');
    if (qtyBtn) {
      event.preventDefault();
      this._updateQuantity(qtyBtn.dataset.cartQtyChange, parseInt(qtyBtn.dataset.change, 10));
      return;
    }

    const removeBtn = event.target.closest('[data-cart-remove]');
    if (removeBtn) {
      event.preventDefault();
      this._removeItem(removeBtn.dataset.cartRemove);
    }
  }

  _onCartItemAdded() {
    this.open();
    this._refreshContents();
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
    document.dispatchEvent(new CustomEvent('cart:opened', { bubbles: true }));

    // Focus close button after transition
    requestAnimationFrame(() => {
      const closeBtn = this.querySelector('.cart-drawer__close');
      if (closeBtn) closeBtn.focus();
    });
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
    document.dispatchEvent(new CustomEvent('cart:closed', { bubbles: true }));

    if (this._lastFocused) {
      this._lastFocused.focus();
      this._lastFocused = null;
    }
  }

  async _updateQuantity(key, change) {
    const item = this.querySelector(`[data-cart-item="${key}"]`);
    const qtyEl = item?.querySelector('.cart-item__qty-value');
    const current = parseInt(qtyEl?.textContent || '1', 10);
    const newQty = Math.max(0, current + change);

    await this._cartChange(key, newQty);
    await this._refreshContents();
  }

  async _removeItem(key) {
    await this._cartChange(key, 0);
    await this._refreshContents();
  }

  async _cartChange(key, quantity) {
    try {
      await fetch('/cart/change.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ id: key, quantity })
      });
    } catch (err) {
      console.error('Cart update failed:', err);
    }
  }

  async _refreshContents() {
    try {
      // Section Rendering API: fetch the header section which contains the cart-drawer snippet.
      // The section ID is 'header' as defined in sections/header.liquid (limit: 1).
      const sectionUrl = `${window.location.pathname}?sections=header`;
      const res = await fetch(sectionUrl, {
        headers: { 'Accept': 'application/json' }
      });
      const json = await res.json();
      const sectionHtml = json['header'];

      if (sectionHtml) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(sectionHtml, 'text/html');

        const newBody = doc.getElementById('cart-drawer-items');
        const newFoot = doc.querySelector('.cart-drawer__footer');
        const newCnt = doc.getElementById('cart-drawer-count');

        if (newBody) {
          const currentBody = this.querySelector('#cart-drawer-items');
          if (currentBody) {
            currentBody.replaceChildren(...Array.from(newBody.childNodes).map(node => node.cloneNode(true)));
          }
        }

        if (newFoot) {
          const existingFoot = this.querySelector('.cart-drawer__footer');
          if (existingFoot) {
            existingFoot.replaceChildren(...Array.from(newFoot.childNodes).map(node => node.cloneNode(true)));
          } else {
            // Footer didn't exist yet (cart was empty) — insert it before end of panel
            const panel = this.querySelector('.cart-drawer__panel');
            if (panel) {
              const footClone = newFoot.cloneNode(true);
              panel.appendChild(footClone);
            }
          }
        } else {
          // Cart is now empty — remove footer if present
          const existingFoot = this.querySelector('.cart-drawer__footer');
          if (existingFoot) existingFoot.remove();
        }

        if (newCnt) {
          const cnt = this.querySelector('#cart-drawer-count');
          if (cnt) cnt.textContent = newCnt.textContent;
        }
      }

      // Fetch live cart data to update header badge
      const cartRes = await fetch(`${routes?.cart_url || '/cart'}.js`, {
        headers: { 'Accept': 'application/json' }
      });
      const cartData = await cartRes.json();

      // Update cart badge (icon mode)
      const badge = document.getElementById('cart-count');
      if (badge) {
        badge.textContent = cartData.item_count > 0 ? cartData.item_count : '';
        badge.classList.toggle('hidden', cartData.item_count === 0);
      }

      // Update any inline cart count text elements
      document.querySelectorAll('[data-cart-count-text]').forEach(el => {
        el.textContent = cartData.item_count;
      });

      // Announce update to screen readers
      const liveRegion = document.getElementById('cart-live-region');
      if (liveRegion) {
        liveRegion.textContent = cartData.item_count.toString();
      }

      document.dispatchEvent(new CustomEvent('cart:updated', {
        bubbles: true,
        detail: { cart: cartData }
      }));
    } catch (err) {
      console.error('Cart refresh failed:', err);
    }
  }
}

customElements.define('cart-drawer', CartDrawer);