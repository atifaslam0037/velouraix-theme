/**
 * @element cart-note
 * @description Debounced auto-saving order instructions textarea for the cart.
 * @fires cart:updated - Fired when the cart note is successfully updated.
 */
class CartNote extends HTMLElement {
  connectedCallback() {
    this.textarea = this.querySelector('textarea');
    if (!this.textarea) return;

    this._handler = this._debounce(this._saveNote.bind(this), 500);
    this.textarea.addEventListener('input', this._handler);
  }

  disconnectedCallback() {
    if (this.textarea && this._handler) {
      this.textarea.removeEventListener('input', this._handler);
    }
  }

  _debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  async _saveNote(event) {
    try {
      const body = JSON.stringify({ note: event.target.value });
      const response = await fetch(`${window.Shopify?.routes?.root || '/'}cart/update.js`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body
      });
      
      if (!response.ok) throw new Error('Network response was not ok');
      const cart = await response.json();
      
      document.dispatchEvent(new CustomEvent('cart:updated', {
        bubbles: true,
        detail: { cart }
      }));
    } catch (error) {
      console.error('Failed to update cart note:', error);
      // Fallback for an aria-live region if present
      const liveRegion = document.getElementById('cart-live-region');
      if (liveRegion) {
        liveRegion.textContent = 'Failed to save note.';
      }
    }
  }
}

customElements.define('cart-note', CartNote);
