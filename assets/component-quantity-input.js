/**
 * @element quantity-input
 * @description VELOURAIX quantity stepper. Wraps a number <input> with − and + buttons.
 *   Fires a native 'change' event on the inner input when value changes via buttons,
 *   so that cart-items-component can detect and call /cart/change.js.
 * @fires change          — on the inner <input> when value changes via button click.
 * @fires quantity:changed — bubbles up with { value, input } detail.
 */
class QuantityInput extends HTMLElement {
  connectedCallback() {
    this._input     = this.querySelector('.quantity-input__field');
    this._minusBtn  = this.querySelector('.quantity-input__btn--minus');
    this._plusBtn   = this.querySelector('.quantity-input__btn--plus');

    if (!this._input || !this._minusBtn || !this._plusBtn) return;

    this._onBtnClick    = this._onBtnClick.bind(this);
    this._onInputChange = this._onInputChange.bind(this);

    this._minusBtn.addEventListener('click', this._onBtnClick);
    this._plusBtn.addEventListener('click',  this._onBtnClick);
    this._input.addEventListener('change',   this._onInputChange);

    this._syncButtonStates();
  }

  disconnectedCallback() {
    this._minusBtn?.removeEventListener('click', this._onBtnClick);
    this._plusBtn?.removeEventListener('click',  this._onBtnClick);
    this._input?.removeEventListener('change',   this._onInputChange);
  }

  // ─── Handlers ────────────────────────────────────────────

  _onBtnClick(event) {
    event.preventDefault();
    if (!this._input) return;

    const prev  = this.getValue();
    const step  = this._num(this._input.step, 1);
    const min   = this._input.min !== '' ? this._num(this._input.min, 0) : null;
    const max   = this._input.max !== '' ? this._num(this._input.max, Infinity) : null;

    let next = event.currentTarget === this._plusBtn ? prev + step : prev - step;
    if (min !== null) next = Math.max(min, next);
    if (max !== null) next = Math.min(max, next);

    if (next === prev) return; // already at boundary

    this._input.value = String(next);
    this._syncButtonStates();

    // Fire native change so cart-items-component hears it
    this._input.dispatchEvent(new Event('change', { bubbles: true }));

    this.dispatchEvent(new CustomEvent('quantity:changed', {
      bubbles: true,
      detail: { value: next, prev, input: this._input },
    }));
  }

  _onInputChange() {
    this._clamp();
    this._syncButtonStates();
  }

  // ─── Helpers ─────────────────────────────────────────────

  _syncButtonStates() {
    if (!this._input) return;
    const val = this.getValue();
    const min = this._num(this._input.min, 0);
    const max = this._input.max !== '' ? this._num(this._input.max, Infinity) : Infinity;

    // Minus is disabled at or below min
    this._minusBtn.disabled = val <= min;
    // Plus is disabled at or above max
    this._plusBtn.disabled  = val >= max;
  }

  _clamp() {
    if (!this._input) return;
    const min = this._input.min !== '' ? this._num(this._input.min, 0) : null;
    const max = this._input.max !== '' ? this._num(this._input.max, Infinity) : null;
    let v = this._num(this._input.value, min ?? 0);
    if (min !== null) v = Math.max(min, v);
    if (max !== null) v = Math.min(max, v);
    this._input.value = String(v);
  }

  _num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  // ─── Public API ──────────────────────────────────────────

  getValue() { return this._num(this._input?.value, 1); }

  setValue(value) {
    if (!this._input) return;
    this._input.value = String(value);
    this._clamp();
    this._syncButtonStates();
  }
}

customElements.define('quantity-input', QuantityInput);
