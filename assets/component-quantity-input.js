/**
 * @element quantity-input
 * @description VELOURAIX quantity stepper web component.
 *   Wraps a number <input> with − and + buttons.
 *   Fires a native 'change' event on the input when the value changes
 *   so that cart-items-component can detect and process it.
 * @fires change - On the inner <input> when value changes via button.
 */
class QuantityInput extends HTMLElement {
  connectedCallback() {
    // Guard: require input and buttons to be present
    this._input = this.querySelector('.quantity-input__field');
    this._minusBtn = this.querySelector('.quantity-input__btn--minus');
    this._plusBtn = this.querySelector('.quantity-input__btn--plus');

    if (!this._input || !this._minusBtn || !this._plusBtn) return;

    this._onBtnClick = this._onBtnClick.bind(this);
    this._onInputChange = this._onInputChange.bind(this);

    this._minusBtn.addEventListener('click', this._onBtnClick);
    this._plusBtn.addEventListener('click', this._onBtnClick);
    this._input.addEventListener('change', this._onInputChange);

    // Sync disabled state on connect
    this._syncMinusState();
  }

  disconnectedCallback() {
    this._minusBtn?.removeEventListener('click', this._onBtnClick);
    this._plusBtn?.removeEventListener('click', this._onBtnClick);
    this._input?.removeEventListener('change', this._onInputChange);
  }

  // ── Handlers ────────────────────────────────────────────

  _onBtnClick(event) {
    event.preventDefault();
    if (!this._input) return;

    const prev = this._input.value;

    if (event.currentTarget === this._plusBtn) {
      this._input.stepUp();
    } else {
      this._input.stepDown();
    }

    this._syncMinusState();

    // Only fire if value actually changed
    if (prev !== this._input.value) {
      this._input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  _onInputChange() {
    this._syncMinusState();
  }

  // ── Helpers ─────────────────────────────────────────────

  /**
   * Disables the minus button when value is at or below minimum.
   */
  _syncMinusState() {
    if (!this._input || !this._minusBtn) return;
    const val = parseInt(this._input.value, 10);
    const min = parseInt(this._input.min ?? '0', 10);
    this._minusBtn.disabled = val <= min;
  }

  /**
   * Public API: set value programmatically.
   * @param {number} value
   */
  setValue(value) {
    if (!this._input) return;
    this._input.value = String(value);
    this._syncMinusState();
  }

  /**
   * Public API: get current numeric value.
   * @returns {number}
   */
  getValue() {
    return parseInt(this._input?.value ?? '1', 10) || 1;
  }
}

customElements.define('quantity-input', QuantityInput);
