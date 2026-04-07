/**
 * @element variant-picker
 * Fetches fresh product section HTML when variant changes.
 */
class VariantPicker extends HTMLElement {
  connectedCallback() {
    this._onChange = this._onChange.bind(this);
    this.addEventListener('change', this._onChange);
    this._isFetching = false;
  }

  disconnectedCallback() {
    this.removeEventListener('change', this._onChange);
  }

  async _onChange(event) {
    const field = event.target.closest('select[name="id"], input[name="id"]');
    if (!field) return;
    if (this._isFetching) return;

    const variantId = field.value;
    const sectionId = this.dataset.sectionId;
    const baseUrl = this.dataset.url || window.location.pathname;
    if (!variantId || !sectionId) return;

    const sectionUrl = `${baseUrl}?variant=${encodeURIComponent(variantId)}&section_id=${encodeURIComponent(sectionId)}`;

    try {
      this._isFetching = true;
      const current = document.querySelector(`#MainProduct-${sectionId}`);
      if (current) {
        current.classList.add('is-variant-loading');
        current.setAttribute('aria-busy', 'true');
      }

      const response = await fetch(sectionUrl, { headers: { Accept: 'text/html' } });
      if (!response.ok) return;

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const incoming = doc.querySelector(`#MainProduct-${sectionId}`);
      const mounted = document.querySelector(`#MainProduct-${sectionId}`);
      if (!incoming || !mounted) return;

      mounted.innerHTML = incoming.innerHTML;

      const nextUrl = `${baseUrl}?variant=${encodeURIComponent(variantId)}`;
      window.history.replaceState({}, '', nextUrl);
      document.dispatchEvent(new CustomEvent('variant:changed', { bubbles: true, detail: { variantId } }));
    } catch (error) {
      console.error('[VariantPicker] Failed to update variant section:', error);
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
}

if (!customElements.get('variant-picker')) {
  customElements.define('variant-picker', VariantPicker);
}
