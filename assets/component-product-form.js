/**
 * @element product-form
 * @description VELOURAIX AJAX product form handler.
 *   Intercepts the native form submit, posts to /cart/add.js, manages
 *   loading state on the submit button, and dispatches cart:item-added on success
 *   so CartDrawerComponent automatically opens and refreshes.
 *
 * @fires cart:item-added  { cart } — after item successfully added to cart.
 * @fires cart:error       { message } — after a failed add-to-cart attempt.
 * @listens submit — on the inner <form> element.
 */
class ProductForm extends HTMLElement {
  connectedCallback() {
    this._form = this.querySelector('form[data-type="add-to-cart-form"]');
    if (!this._form) return; // guard: no form found, do nothing

    this._submitBtn     = this._form.querySelector('[type="submit"]');
    this._errorWrapper  = this._form.querySelector('.product-form__error-message-wrapper');
    this._errorMsg      = this._form.querySelector('.product-form__error-message');

    this._onSubmit = this._onSubmit.bind(this);
    this._form.addEventListener('submit', this._onSubmit);
  }

  disconnectedCallback() {
    if (this._form) {
      this._form.removeEventListener('submit', this._onSubmit);
    }
  }

  // ─── Handlers ────────────────────────────────────────────

  async _onSubmit(evt) {
    evt.preventDefault();
    if (!this._submitBtn) return;

    // Prevent double-submit
    if (this._submitBtn.classList.contains('is-loading')) return;

    this._setLoading(true);
    this._clearError();

    const formData = new FormData(this._form);

    // Ensure the disabled id input is still included
    const idInput = this._form.querySelector('input[name="id"]');
    if (idInput && !formData.has('id')) {
      formData.append('id', idInput.value);
    }

    try {
      const response = await fetch(
        window.theme?.routes?.cart_add_url || '/cart/add.js',
        {
          method: 'POST',
          headers: { Accept: 'application/json' },
          body: formData,
        }
      );

      const data = await response.json();

      // Shopify returns { status, message, description } on error
      if (!response.ok || data.status) {
        this._showError(data.description || data.message || 'Could not add item to cart.');
        document.dispatchEvent(
          new CustomEvent('cart:error', {
            bubbles: true,
            detail: { message: data.description || data.message },
          })
        );
        return;
      }

      // Success — notify cart system. CartDrawerComponent listens for this
      // and opens + refreshes automatically.
      document.dispatchEvent(
        new CustomEvent('cart:item-added', {
          bubbles: true,
          detail: { cart: data },
        })
      );

      // Close quick-add modal if this form is inside one
      const modal = document.getElementById('QuickAddModal');
      if (modal && (modal.contains(this._form) || modal.open)) {
        if (typeof modal.close === 'function') modal.close();
        modal.removeAttribute('open');
        document.body.style.overflow = '';
      }

    } catch (err) {
      console.error('[ProductForm] Submit failed:', err);
      this._showError('Something went wrong. Please try again.');
    } finally {
      this._setLoading(false);
    }
  }

  // ─── State helpers ────────────────────────────────────────

  _setLoading(isLoading) {
    if (!this._submitBtn) return;
    this._submitBtn.classList.toggle('is-loading', isLoading);
    this._submitBtn.setAttribute('aria-disabled', String(isLoading));
  }

  _showError(message) {
    if (!this._errorWrapper || !this._errorMsg) return;
    this._errorMsg.textContent = message;
    this._errorWrapper.removeAttribute('hidden');
  }

  _clearError() {
    if (!this._errorWrapper || !this._errorMsg) return;
    this._errorMsg.textContent = '';
    this._errorWrapper.setAttribute('hidden', '');
  }
}

if (!customElements.get('product-form')) {
  customElements.define('product-form', ProductForm);
}
