/**
 * @element variant-picker
 * @description Handles variant selection for both:
 *   1. Full product page (SRA fetch to update #MainProduct-{sectionId})
 *   2. Quick-add modal (no fetch — updates form + UI directly from embedded JSON)
 *
 * Currency is always formatted using window.theme.moneyFormat so the store's
 * configured format (Rs., $, £, etc.) is used everywhere.
 */
if (!customElements.get('variant-picker')) {
  class VariantPicker extends HTMLElement {
    connectedCallback() {
      this._onChange = this._onChange.bind(this);
      this.addEventListener('change', this._onChange);
      this._isFetching = false;
    }

    disconnectedCallback() {
      this.removeEventListener('change', this._onChange);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Returns true when this picker is rendered inside the quick-add modal.
     * In that context we skip SRA and update the DOM directly via embedded JSON.
     */
    get _isModal() {
      return !!this.closest('#QuickAddModal, quick-add-modal');
    }

    /**
     * Format money using the store's money_format exposed via window.theme.moneyFormat.
     * Falls back to Shopify.formatMoney when available, then to a plain decimal.
     * @param {number} cents - Price in cents.
     * @returns {string}
     */
    _formatMoney(cents) {
      if (typeof window.Shopify?.formatMoney === 'function') {
        return window.Shopify.formatMoney(cents, window.theme?.moneyFormat);
      }
      const fmt = window.theme?.moneyFormat || '{{amount}}';
      const amount = (cents / 100).toFixed(2);
      return fmt.replace(/\{\{\s*amount[^}]*\}\}/g, amount);
    }

    // ── Change handler ────────────────────────────────────────────────────────

    async _onChange(event) {
      const radio  = event.target.closest('input[type="radio"][data-option-position]');
      const select = event.target.closest('select[name="id"]');
      if (!radio && !select) return;

      // Always update the "current value" label immediately for responsiveness
      if (select) {
        this._updateCurrentValueLabel(
          select.options[select.selectedIndex]?.text ?? '',
          null
        );
      } else {
        this._updateCurrentValueLabel(
          radio.value,
          radio.closest('.product-variant-picker-snippet__fieldset')
        );
      }

      // Resolve the matching variant
      const variantId = this._resolveVariantId(radio, select);
      if (!variantId) return;

      if (this._isModal) {
        // Modal mode: no SRA — update form input + price/button directly
        this._applyVariantToModal(parseInt(variantId, 10));
      } else {
        // Full-page mode: SRA fetch
        if (this._isFetching) return;
        const sectionId = this.dataset.sectionId;
        const baseUrl   = this.dataset.url || window.location.pathname;
        if (!sectionId) return;
        await this._fetchVariant(variantId, sectionId, baseUrl);
      }
    }

    // ── Variant resolution ────────────────────────────────────────────────────

    _resolveVariantId(radio, select) {
      // Dropdown: value IS the variant id
      if (select) return select.value || null;

      // Button group: collect all checked radios in this picker and find match
      const positions = {};
      this.querySelectorAll('input[type="radio"]:checked[data-option-position]').forEach((r) => {
        positions[parseInt(r.dataset.optionPosition, 10)] = r.value;
      });

      const variantsEl = this.querySelector('[data-variants-json]');
      if (!variantsEl) {
        const hidden = this.querySelector('input[type="hidden"][name="id"]');
        return hidden ? hidden.value : null;
      }

      let variants;
      try { variants = JSON.parse(variantsEl.textContent); } catch (_) { return null; }

      const match = variants.find((v) =>
        Object.entries(positions).every(([pos, val]) =>
          v[`option${parseInt(pos, 10) + 1}`] === val
        )
      );
      return match ? String(match.id) : null;
    }

    // ── Label update ──────────────────────────────────────────────────────────

    _updateCurrentValueLabel(value, fieldset) {
      if (fieldset) {
        // Update only the fieldset that contains the changed option
        const span = fieldset.querySelector('.product-variant-picker-snippet__current-value');
        if (span) span.textContent = value;
      } else {
        // Dropdown fallback: update all current-value spans (only one in dropdown mode)
        this.querySelectorAll('.product-variant-picker-snippet__current-value').forEach((s) => {
          s.textContent = value;
        });
      }
    }

    // ── Modal mode: apply variant without SRA ─────────────────────────────────

    _applyVariantToModal(variantId) {
      // Find product JSON embedded in the modal (by quick-add.liquid)
      const jsonScript = document.querySelector('#QuickAddModal [data-product-json], quick-add-modal [data-product-json]');
      if (!jsonScript) return;

      let product;
      try { product = JSON.parse(jsonScript.textContent); } catch (_) { return; }

      const variant = product.variants.find((v) => v.id === variantId);
      if (!variant) return;

      // 1. Update the hidden <input name="id"> in the form
      const modal = document.querySelector('#QuickAddModal, quick-add-modal');
      const form = modal?.querySelector('form[data-type="add-to-cart-form"]');
      if (form) {
        const idInput = form.querySelector('input[name="id"]');
        if (idInput) idInput.value = variantId;
      }

      // 2. Update price display (.qa__price-row)
      const priceRow = document.querySelector('#QuickAddModal .qa__price-row, quick-add-modal .qa__price-row');
      if (priceRow) {
        let html = '';
        if (variant.compare_at_price > variant.price) {
          html = `<span class="qa__price qa__price--sale">${this._formatMoney(variant.price)}</span>
                  <s class="qa__compare">${this._formatMoney(variant.compare_at_price)}</s>`;
        } else {
          html = `<span class="qa__price">${this._formatMoney(variant.price)}</span>`;
        }
        priceRow.innerHTML = html;
      }

      // 3. Update Add to Cart button (.qa__atc-btn)
      const atcBtn = document.querySelector('#QuickAddModal .qa__atc-btn, quick-add-modal .qa__atc-btn');
      if (atcBtn) {
        const label = atcBtn.querySelector('.qa__atc-label');
        if (variant.available) {
          atcBtn.removeAttribute('disabled');
          if (label) {
            label.innerHTML = `${window.theme?.strings?.addToCart?.toUpperCase() ?? 'ADD TO CART'} &nbsp;&mdash;&nbsp; <span data-qa-atc-price>${this._formatMoney(variant.price)}</span>`;
          }
        } else {
          atcBtn.setAttribute('disabled', '');
          if (label) label.textContent = window.theme?.strings?.soldOut?.toUpperCase() ?? 'SOLD OUT';
        }
      }

      document.dispatchEvent(new CustomEvent('variant:changed', {
        bubbles: true,
        detail: { variantId },
      }));
    }

    // ── Full-page SRA mode ────────────────────────────────────────────────────

    async _fetchVariant(variantId, sectionId, baseUrl) {
      const sectionUrl = `${baseUrl}?variant=${encodeURIComponent(variantId)}&section_id=${encodeURIComponent(sectionId)}`;

      try {
        this._isFetching = true;

        const mainProduct = document.querySelector(`#MainProduct-${sectionId}`);
        if (mainProduct) {
          mainProduct.classList.add('is-variant-loading');
          mainProduct.setAttribute('aria-busy', 'true');
        }

        const response = await fetch(sectionUrl, { headers: { Accept: 'text/html' } });
        if (!response.ok) return;

        const html = await response.text();
        const doc  = new DOMParser().parseFromString(html, 'text/html');
        const incoming = doc.querySelector(`#MainProduct-${sectionId}`);
        const mounted  = document.querySelector(`#MainProduct-${sectionId}`);
        if (!incoming || !mounted) return;

        this._replaceChildren(mounted, incoming);

        const nextUrl = `${baseUrl}?variant=${encodeURIComponent(variantId)}`;
        window.history.replaceState({}, '', nextUrl);

        document.dispatchEvent(new CustomEvent('variant:changed', {
          bubbles: true,
          detail: { variantId },
        }));
      } catch (err) {
        console.error('[VariantPicker] Failed to update variant:', err);
      } finally {
        const mounted = document.querySelector(`#MainProduct-${sectionId}`);
        if (mounted) {
          requestAnimationFrame(() => {
            mounted.classList.remove('is-variant-loading');
            mounted.removeAttribute('aria-busy');
          });
        }
        this._isFetching = false;
      }
    }

    _replaceChildren(target, source) {
      if (!target || !source) return;
      const fragment = document.createDocumentFragment();
      Array.from(source.childNodes).forEach((node) => {
        fragment.appendChild(node.cloneNode(true));
      });
      target.replaceChildren(fragment);
    }
  }

  customElements.define('variant-picker', VariantPicker);
}