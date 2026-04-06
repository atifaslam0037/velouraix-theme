/**
 * StickyHeader custom element.
 * Manages sticky positioning, transparent mode, and --header-offset CSS variable.
 * Dispatches 'header:offset-changed' when height changes.
 */
class StickyHeader extends HTMLElement {
  connectedCallback() {
    this._sticky = this.dataset.sticky === 'true';
    this._transparent = this.dataset.transparent === 'true';
    this._lastHeight = 0;

    this._updateOffset();

    if (this._sticky || this._transparent) {
      this._onScroll = this._handleScroll.bind(this);
      window.addEventListener('scroll', this._onScroll, { passive: true });
      this._handleScroll();
    }

    // Recalculate after fonts/layout settle
    window.addEventListener('load', () => this._updateOffset(), { once: true });

    // Recalculate on resize and orientation change
    this._onResize = this._updateOffset.bind(this);
    window.addEventListener('resize', this._onResize, { passive: true });

    // Use ResizeObserver for accurate tracking
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => this._updateOffset());
      this._resizeObserver.observe(this);
    }
  }

  disconnectedCallback() {
    if (this._onScroll) {
      window.removeEventListener('scroll', this._onScroll);
    }
    if (this._onResize) {
      window.removeEventListener('resize', this._onResize);
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    }
  }

  _handleScroll() {
    const scrolled = window.scrollY > 2;
    this.classList.toggle('is-scrolled', scrolled);
  }

  _updateOffset() {
    const h = this.offsetHeight;
    if (h !== this._lastHeight) {
      this._lastHeight = h;
      document.documentElement.style.setProperty('--header-offset', h + 'px');
      document.dispatchEvent(new CustomEvent('header:offset-changed', { detail: { height: h } }));
    }
  }
}

customElements.define('sticky-header', StickyHeader);