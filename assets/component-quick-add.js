/**
 * Quick Add Component
 * Handles inline adding to cart and opening the quick add modal.
 */
class QuickAdd {
  constructor() {
    this.handleTriggerClick = this.handleTriggerClick.bind(this);
    this.initEvents();
  }

  get modal() {
    return document.getElementById('QuickAddModal');
  }

  get modalContent() {
    return this.modal?.querySelector('.quick-add-modal__content');
  }

  initEvents() {
    document.addEventListener('click', (event) => {
      // Handle Trigger Clicks
      const trigger = event.target.closest('[data-quick-add-trigger]');
      if (trigger) {
        event.preventDefault();
        this.handleTriggerClick(trigger);
        return;
      }

      // Handle Modal Close Clicks
      const closeBtn = event.target.closest('[data-quick-add-close]');
      if (closeBtn) {
        event.preventDefault();
        this.closeModal();
        return;
      }

      // Handle Backdrop Clicks
      const modal = this.modal;
      if (modal && event.target === modal) {
        this.closeModal();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.modal?.hasAttribute('open')) {
        this.closeModal();
      }
    });
  }

  async handleTriggerClick(trigger) {
    const url = trigger.dataset.quickAddTrigger;
    const style = trigger.dataset.quickAddStyle;
    const singleVariant = trigger.dataset.productSingleVariant === 'true';
    const variantId = trigger.dataset.variantId;

    if (style === 'inline' && singleVariant && variantId) {
      // Inline mode: Add directly
      trigger.setAttribute('aria-disabled', 'true');
      trigger.classList.add('is-loading');

      try {
        await this.addToCart(variantId, 1);
        this.triggerCartDrawer();
      } catch (err) {
        console.error('Quick Add Inline Error:', err);
      } finally {
        trigger.removeAttribute('aria-disabled');
        trigger.classList.remove('is-loading');
      }
    } else {
      // Modal mode: Fetch and open
      this.openModal(url);
    }
  }

  async openModal(productUrl) {
    if (!this.modal || !this.modalContent) return;

    this.modalContent.innerHTML = `
      <div class="quick-add__skeleton" style="padding:4rem; text-align:center;">
        <svg width="40" height="40" viewBox="0 0 40 40" class="spinner"><circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" stroke-width="2" opacity="0.3"></circle><circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="113" stroke-dashoffset="85" style="transform-origin:center;animation:spin 1s linear infinite;"></circle></svg>
      </div>
    `;

    if (typeof this.modal.showModal === 'function') {
      try {
        this.modal.showModal();
      } catch (e) { } // Prevent error if already open
    } else {
      this.modal.setAttribute('open', '');
    }

    document.body.style.overflow = 'hidden';

    try {
      const response = await fetch(`${productUrl}${productUrl.includes('?') ? '&' : '?'}section_id=quick-add`);
      if (!response.ok) { this.closeModal(); return; }

      const text = await response.text();
      const html = new DOMParser().parseFromString(text, 'text/html');
      const inlineContent = html.querySelector('.shopify-section')?.innerHTML || '';

      if (inlineContent) {
        this.modalContent.innerHTML = inlineContent;
        this.productData = this.getProductData();
        this._initSliders();

        // Direct submit binding — more reliable than relying on custom element upgrade timing
        const form = this.modalContent.querySelector('form[data-type="add-to-cart-form"]');
        if (form) {
          form.addEventListener('submit', (evt) => this._handleModalFormSubmit(evt), { once: true });
        }
      } else {
        this.closeModal();
      }
    } catch (e) {
      console.error('Failed to load quick add form', e);
      this.closeModal();
    }
  }

  _initSliders() {
    if (!this.modalContent) return;
    this.modalContent.querySelectorAll('.qa__slider:not([data-slider-init])').forEach((slider) => {
      slider.setAttribute('data-slider-init', '1');
      let isDrag = false, startX = 0, scrollLeft = 0;

      slider.addEventListener('mousedown', (e) => {
        isDrag = true; startX = e.pageX; scrollLeft = slider.scrollLeft;
        slider.classList.add('is-dragging');
      });
      window.addEventListener('mouseup', () => {
        if (!isDrag) return;
        isDrag = false;
        slider.classList.remove('is-dragging');
      }, { passive: true });
      slider.addEventListener('mousemove', (e) => {
        if (!isDrag) return;
        e.preventDefault();
        slider.scrollLeft = scrollLeft - (e.pageX - startX) * 1.15;
      });
      slider.addEventListener('mouseleave', () => {
        isDrag = false;
        slider.classList.remove('is-dragging');
      });
      slider.addEventListener('click', (e) => {
        if (Math.abs(slider.scrollLeft - scrollLeft) > 4) e.preventDefault();
      });
    });

    // Prev/Next slider buttons (delegated on modal)
    if (!this.modal._sliderNavInit) {
      this.modal._sliderNavInit = true;
      this.modal.addEventListener('click', (e) => {
        const btn = e.target.closest('.qa__slider-btn');
        if (!btn) return;
        const slider = btn.dataset.sliderId && document.getElementById(btn.dataset.sliderId);
        if (!slider) return;
        const slideWidth = (slider.querySelector('.qa__slide') || slider).offsetWidth;
        slider.scrollBy({ left: parseInt(btn.dataset.dir, 10) * slideWidth, behavior: 'smooth' });
      });
    }
  }


  closeModal() {
    if (!this.modal) return;
    if (typeof this.modal.close === 'function') {
      this.modal.close();
    }
    this.modal.removeAttribute('open');
    if (this.modalContent) this.modalContent.innerHTML = '';
    document.body.style.overflow = '';
  }

  getProductData() {
    const script = this.modalContent.querySelector('[data-product-json]');
    if (script) {
      try {
        return JSON.parse(script.textContent);
      } catch (e) { return null; }
    }
    return null;
  }

  async addToCart(id, quantity) {
    const res = await fetch(window.Shopify.routes.root + 'cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ id, quantity }] })
    });
    if (!res.ok) throw new Error('Add to cart failed');
    return await res.json();
  }

  async _handleModalFormSubmit(evt) {
    evt.preventDefault();
    const form = evt.target;
    const submitBtn = form.querySelector('[type="submit"]');
    if (!submitBtn || submitBtn.getAttribute('aria-disabled') === 'true') return;

    submitBtn.setAttribute('aria-disabled', 'true');
    submitBtn.classList.add('is-loading');

    const formData = new FormData(form);

    try {
      const res = await fetch(window.theme?.routes?.cart_add_url || '/cart/add.js', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formData,
      });
      const data = await res.json();

      if (!res.ok || data.status) {
        const errorWrapper = form.querySelector('.product-form__error-message-wrapper');
        if (errorWrapper) {
          errorWrapper.removeAttribute('hidden');
          const errMsg = errorWrapper.querySelector('.product-form__error-message');
          if (errMsg) errMsg.textContent = data.description || data.message || 'Could not add to cart.';
        }
        return;
      }

      // Close modal first, then trigger drawer so drawer gets fresh cart
      this.closeModal();
      document.dispatchEvent(new CustomEvent('cart:item-added', { bubbles: true, detail: { cart: data } }));

    } catch (err) {
      console.error('[QuickAdd] Add to cart failed:', err);
    } finally {
      submitBtn.classList.remove('is-loading');
      submitBtn.removeAttribute('aria-disabled');
    }
  }

  triggerCartDrawer() {
    // CartDrawerComponent listens for cart:item-added → opens + refreshes.
    // Do NOT also dispatch cart:opened here — that causes a race condition
    // where the drawer opens before the HTML refresh completes.
    document.dispatchEvent(new CustomEvent('cart:item-added', { bubbles: true }));
  }
}

function initQuickAdd() {
  if (!window.quickAddInstance) {
    window.quickAddInstance = new QuickAdd();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initQuickAdd);
} else {
  initQuickAdd();
}


