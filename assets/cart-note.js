/**
 * @element cart-note
 * @description VELOURAIX cart note custom element to auto-save contents on input.
 *
 * @fires cart:updated  detail: { cart } after update is successful
 * @listens input
 */
class CartNote extends HTMLElement {
  connectedCallback() {
    this.textarea = this.querySelector('[data-cart-note]');
    
    if (!this.textarea) return;

    this._onInputBound = this._debounce(this._onInput.bind(this), 300);
    this.textarea.addEventListener('input', this._onInputBound);
  }

  disconnectedCallback() {
    if (!this.textarea) return;
    this.textarea.removeEventListener('input', this._onInputBound);
  }

  async _onInput(event) {
    try {
      const note = event.target.value;
      const response = await fetch(`${window.Shopify?.routes?.root || '/'}cart/update.js`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({ note })
      });

      const cart = await response.json();
      
      document.dispatchEvent(
        new CustomEvent('cart:updated', { bubbles: true, detail: { cart } })
      );
    } catch (error) {
      console.error('Failed to update cart note:', error);
    }
  }

  _debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }
}

customElements.define('cart-note', CartNote);
