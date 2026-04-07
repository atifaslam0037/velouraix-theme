/**
 * @element quantity-selector-component
 * Plus/minus quantity controls for product form quantity field.
 */
class QuantitySelectorComponent extends HTMLElement {
  connectedCallback() {
    this._input = this.querySelector('input[type="number"]');
    this._minus = this.querySelector('button[name="minus"]');
    this._plus = this.querySelector('button[name="plus"]');
    if (!this._input || !this._minus || !this._plus) return;

    this._onClick = this._onClick.bind(this);
    this._onInput = this._onInput.bind(this);

    this._minus.addEventListener('click', this._onClick);
    this._plus.addEventListener('click', this._onClick);
    this._input.addEventListener('change', this._onInput);

    this._sync();
  }

  disconnectedCallback() {
    this._minus?.removeEventListener('click', this._onClick);
    this._plus?.removeEventListener('click', this._onClick);
    this._input?.removeEventListener('change', this._onInput);
  }

  _onClick(event) {
    event.preventDefault();
    if (!this._input) return;

    const oldValue = this._safeValue(this._input.value);
    const step = this._safeValue(this._input.step || '1', 1);
    const min = this._input.min !== '' ? this._safeValue(this._input.min, 1) : null;
    const max = this._input.max !== '' ? this._safeValue(this._input.max, Infinity) : null;

    let nextValue = oldValue;
    if (event.currentTarget === this._plus) nextValue += step;
    if (event.currentTarget === this._minus) nextValue -= step;

    if (min !== null) nextValue = Math.max(min, nextValue);
    if (max !== null) nextValue = Math.min(max, nextValue);

    this._input.value = String(nextValue);
    this._sync();

    if (nextValue !== oldValue) {
      this._input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  _onInput() {
    const min = this._input.min !== '' ? this._safeValue(this._input.min, 1) : null;
    const max = this._input.max !== '' ? this._safeValue(this._input.max, Infinity) : null;
    let value = this._safeValue(this._input.value, 1);
    if (min !== null) value = Math.max(min, value);
    if (max !== null) value = Math.min(max, value);
    this._input.value = String(value);
    this._sync();
  }

  _sync() {
    const min = this._input.min !== '' ? this._safeValue(this._input.min, 1) : null;
    const max = this._input.max !== '' ? this._safeValue(this._input.max, Infinity) : null;
    const value = this._safeValue(this._input.value, 1);

    this._minus.disabled = min !== null ? value <= min : false;
    this._plus.disabled = max !== null ? value >= max : false;
  }

  _safeValue(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}

if (!customElements.get('quantity-selector-component')) {
  customElements.define('quantity-selector-component', QuantitySelectorComponent);
}
