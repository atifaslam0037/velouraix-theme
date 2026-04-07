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

    const prev = this.getValue();
    const step = this._readNumber(this._input.step, 1);
    const min = this._input.min !== '' ? this._readNumber(this._input.min, 0) : null;
    const max = this._input.max !== '' ? this._readNumber(this._input.max, Infinity) : null;
    let next = prev;

    if (event.currentTarget === this._plusBtn) {
      next += step;
    } else {
      next -= step;
    }

    if (min !== null) next = Math.max(min, next);
    if (max !== null) next = Math.min(max, next);

    this._input.value = String(next);

    this._syncMinusState();
    this._syncPlusState();

    // Only fire if value actually changed
    if (prev !== this.getValue()) {
      this._input.dispatchEvent(new Event('change', { bubbles: true }));
      this.dispatchEvent(
        new CustomEvent('quantity:changed', {
          bubbles: true,
          detail: { value: this.getValue(), input: this._input },
        })
      );
    }
  }

  _onInputChange() {
    this._normalize();
    this._syncMinusState();
    this._syncPlusState();
  }

  // ── Helpers ─────────────────────────────────────────────

  /**
   * Disables the minus button when value is at or below minimum.
   */
  _syncMinusState() {
    if (!this._input || !this._minusBtn) return;
    const val = this._readNumber(this._input.value, 0);
    const min = this._readNumber(this._input.min ?? '0', 0);
    this._minusBtn.disabled = val <= min;
  }

  _syncPlusState() {
    if (!this._input || !this._plusBtn) return;
    if (this._input.max === '') {
      this._plusBtn.disabled = false;
      return;
    }
    const val = this._readNumber(this._input.value, 0);
    const max = this._readNumber(this._input.max, Infinity);
    this._plusBtn.disabled = val >= max;
  }

  _normalize() {
    if (!this._input) return;
    const min = this._input.min !== '' ? this._readNumber(this._input.min, 0) : null;
    const max = this._input.max !== '' ? this._readNumber(this._input.max, Infinity) : null;
    let value = this._readNumber(this._input.value, min ?? 0);
    if (min !== null) value = Math.max(min, value);
    if (max !== null) value = Math.min(max, value);
    this._input.value = String(value);
  }

  /**
   * Public API: set value programmatically.
   * @param {number} value
   */
  setValue(value) {
    if (!this._input) return;
    this._input.value = String(value);
    this._normalize();
    this._syncMinusState();
    this._syncPlusState();
  }

  /**
   * Public API: get current numeric value.
   * @returns {number}
   */
  getValue() {
    return this._readNumber(this._input?.value ?? '1', 1);
  }

  _readNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }
}

customElements.define('quantity-input', QuantityInput);
