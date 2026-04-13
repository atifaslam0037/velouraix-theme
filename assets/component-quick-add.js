/**
 * Quick Add Component
 * Handles inline adding to cart and opening the quick add modal.
 */
class QuickAdd {
  constructor() {
    this.handleTriggerClick = this.handleTriggerClick.bind(this);
    this.handleVariantChange = this.handleVariantChange.bind(this);

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

    document.addEventListener('change', (evt) => {
      if (evt.target.closest('variant-picker')) {
        this.handleVariantChange(evt);
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
      } catch(e) {} // Prevent error if already open
    } else {
      this.modal.setAttribute('open', '');
    }
    
    document.body.style.overflow = 'hidden';

    try {
      const response = await fetch(`${productUrl}${productUrl.includes('?') ? '&' : '?'}section_id=quick-add`);
      const text = await response.text();
      const html = new DOMParser().parseFromString(text, 'text/html');
      const inlineContent = html.querySelector('.shopify-section')?.innerHTML || '';
      
      if (inlineContent) {
        this.modalContent.innerHTML = inlineContent;
        this.productData = this.getProductData();

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

  handleVariantChange() {
    if (!this.productData) return;
    const form = this.modal?.querySelector('#QuickAddForm');
    if (!form) return;
    
    // Build array of selected options
    const options = [];
    for (let i = 1; i <= 3; i++) {
      const field = form.querySelector(`[name="options[Option${i}]"], [name="options[option${i}]"]`);
      if (field) {
        options.push(field.value);
      } else {
        // Fallback for native inputs that use option names directly
        const rawInputs = Array.from(form.querySelectorAll('input[type="radio"]:checked, select'));
        if (rawInputs.length > 0) {
           options.push(rawInputs[i-1]?.value || '');
        }
      }
    }

    // Find variant
    const matchedVariant = this.productData.variants.find(v => {
      const vOptions = [v.option1, v.option2, v.option3].filter(Boolean);
      return options.length === vOptions.length && options.every((val, i) => val === vOptions[i]);
    });

    if (matchedVariant) {
      form.querySelector('input[name="id"]').value = matchedVariant.id;
      this.updateVariantUI(matchedVariant);
    }
  }

  updateVariantUI(variant) {
    const modalContent = this.modalContent;
    if (!modalContent) return;
    const submitBtn = modalContent.querySelector('.quick-add__submit');
    const priceDisplay = modalContent.querySelector('#quick-add-price');
    
    // Use window.Shopify.formatMoney if available
    const formatMoney = (cents) => {
      if (typeof window.Shopify !== 'undefined' && typeof window.Shopify.formatMoney === 'function') {
        return window.Shopify.formatMoney(cents);
      }
      return '$' + (cents / 100).toFixed(2);
    };

    if (variant.available) {
      submitBtn.removeAttribute('disabled');
      const btnSpan = submitBtn.querySelector('span');
      if (btnSpan && window.theme?.strings?.addToCart) {
         const priceText = formatMoney(variant.price);
         btnSpan.innerHTML = `${window.theme.strings.addToCart.toUpperCase()} - <span data-add-to-cart-price>${priceText}</span>`;
      }
    } else {
      submitBtn.setAttribute('disabled', 'disabled');
      const btnSpan = submitBtn.querySelector('span');
      if (btnSpan && window.theme?.strings?.soldOut) {
         btnSpan.parentElement.innerHTML = `<span>${window.theme.strings.soldOut.toUpperCase()}</span>`;
      }
    }

    if (priceDisplay) {
      let priceHtml = '';
      if (variant.compare_at_price > variant.price) {
        priceHtml = `<span class="quick-add__price quick-add__price--sale">${formatMoney(variant.price)}</span>
                     <s class="quick-add__compare">${formatMoney(variant.compare_at_price)}</s>`;
      } else {
        priceHtml = `<span class="quick-add__price">${formatMoney(variant.price)}</span>`;
      }
      priceDisplay.innerHTML = priceHtml;
    }
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


