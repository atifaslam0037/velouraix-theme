/**
 * Quick Add Component — VELOURAIX
 * Modal fetch · mousedown-drag to advance slides · touch swipe · ATC/BIN
 */
class QuickAdd {
  constructor() {
    document.addEventListener('click', e => this._onClick(e));
    document.addEventListener('keydown', e => this._onKey(e));
  }

  get modal() { return document.getElementById('QuickAddModal'); }
  get modalContent() { return this.modal?.querySelector('[data-quick-add-content]'); }

  /* ── Global click router ── */
  _onClick(e) {
    const trigger = e.target.closest('[data-quick-add-trigger]');
    if (trigger) { e.preventDefault(); this._handleTrigger(trigger); return; }

    if (e.target.closest('[data-quick-add-close]')) { e.preventDefault(); this.closeModal(); return; }

    if (this.modal && e.target === this.modal) this.closeModal();
  }

  _onKey(e) {
    if (e.key === 'Escape' && this.modal?.hasAttribute('open')) this.closeModal();
  }

  /* ── Trigger: inline add or open modal ── */
  async _handleTrigger(trigger) {
    const url = trigger.dataset.quickAddTrigger;
    const style = trigger.dataset.quickAddStyle;
    const singleVar = trigger.dataset.productSingleVariant === 'true';
    const variantId = trigger.dataset.variantId;

    if (style === 'inline' && singleVar && variantId) {
      trigger.setAttribute('aria-disabled', 'true');
      trigger.classList.add('is-loading');
      try { await this._addToCart(variantId, 1); this._fireCartEvent(); }
      catch (err) { console.error('[QuickAdd] inline:', err); }
      finally {
        trigger.removeAttribute('aria-disabled');
        trigger.classList.remove('is-loading');
      }
    } else {
      this._openModal(url);
    }
  }

  /* ── Open modal + fetch section HTML ── */
  async _openModal(productUrl) {
    if (!this.modal || !this.modalContent) return;

    this.modalContent.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;min-height:320px;">
        <svg width="34" height="34" viewBox="0 0 34 34"
          style="animation:qa-spin .9s linear infinite;transform-origin:center;">
          <circle cx="17" cy="17" r="14" fill="none" stroke="#111"
            stroke-width="2" opacity=".15"/>
          <circle cx="17" cy="17" r="14" fill="none" stroke="#111"
            stroke-width="2" stroke-dasharray="88" stroke-dashoffset="66"/>
        </svg>
      </div>`;

    try {
      typeof this.modal.showModal === 'function'
        ? this.modal.showModal()
        : this.modal.setAttribute('open', '');
    } catch (_) { }

    document.body.style.overflow = 'hidden';

    try {
      const sep = productUrl.includes('?') ? '&' : '?';
      const res = await fetch(`${productUrl}${sep}section_id=quick-add`);
      if (!res.ok) { this.closeModal(); return; }

      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const html = doc.querySelector('.shopify-section')?.innerHTML || '';
      if (!html) { this.closeModal(); return; }

      this.modalContent.innerHTML = html;

      this._initGallery();  // fade slides + drag + touch
      this._initArrows();   // delegated prev/next

      const form = this.modalContent.querySelector('form[data-type="add-to-cart-form"]');
      if (form) form.addEventListener('submit', e => this._handleFormSubmit(e), { once: true });

    } catch (err) {
      console.error('[QuickAdd] load failed:', err);
      this.closeModal();
    }
  }

  /* ── Gallery: fade slides + mouse drag + touch swipe ── */
  _initGallery() {
    const wrap = this.modalContent?.querySelector('[id^="qa-slides-"]');
    if (!wrap) return;

    const slides = [...wrap.querySelectorAll('.qa__slide')];
    if (slides.length < 2) return;

    let current = 0;

    const goTo = (idx) => {
      slides[current].classList.remove('is-active');
      current = ((idx % slides.length) + slides.length) % slides.length;
      slides[current].classList.add('is-active');
    };

    // Expose for arrow buttons
    wrap._qaGoTo = (dir) => goTo(current + dir);

    /* ── Mouse drag to advance slide ── */
    let dragStartX = 0;
    let dragMoved = false;
    let isDragging = false;
    const DRAG_THRESHOLD = 50; // px needed to advance

    wrap.addEventListener('mousedown', (e) => {
      // Only primary button, ignore on interactive children
      if (e.button !== 0) return;
      dragStartX = e.clientX;
      dragMoved = false;
      isDragging = true;
      wrap.classList.add('is-dragging');
      // Prevent text selection while dragging
      e.preventDefault();
    });

    // Listen on window so drag works even if cursor leaves the element
    const onMouseMove = (e) => {
      if (!isDragging) return;
      if (Math.abs(e.clientX - dragStartX) > 4) dragMoved = true;
    };

    const onMouseUp = (e) => {
      if (!isDragging) return;
      isDragging = false;
      wrap.classList.remove('is-dragging');

      if (dragMoved) {
        const diff = e.clientX - dragStartX;
        if (Math.abs(diff) >= DRAG_THRESHOLD) {
          wrap._qaGoTo(diff < 0 ? 1 : -1);
        }
      }
      dragMoved = false;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    // Prevent accidental link/image click after a drag
    wrap.addEventListener('click', (e) => {
      if (dragMoved) e.preventDefault();
    });

    // Cleanup listeners when modal closes (stored for removal)
    wrap._qaCleanup = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    /* ── Touch swipe ── */
    let touchStartX = 0, touchStartY = 0, isHorizSwipe = false;

    wrap.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      isHorizSwipe = false;
    }, { passive: true });

    wrap.addEventListener('touchmove', (e) => {
      const dx = Math.abs(e.touches[0].clientX - touchStartX);
      const dy = Math.abs(e.touches[0].clientY - touchStartY);
      if (dx > dy) isHorizSwipe = true;
    }, { passive: true });

    wrap.addEventListener('touchend', (e) => {
      if (!isHorizSwipe) return;
      const diff = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(diff) > 40) wrap._qaGoTo(diff < 0 ? 1 : -1);
    }, { passive: true });
  }

  /* ── Arrow buttons (delegated once per modal open) ── */
  _initArrows() {
    const modal = this.modal;
    if (!modal || modal._qaArrowsInit) return;
    modal._qaArrowsInit = true;

    modal.addEventListener('click', (e) => {
      const btn = e.target.closest('.qa__arrow-btn[data-slides-id]');
      if (!btn) return;
      const wrap = document.getElementById(btn.dataset.slidesId);
      if (wrap?._qaGoTo) wrap._qaGoTo(parseInt(btn.dataset.dir, 10));
    });
  }

  /* ── Close ── */
  closeModal() {
    const m = this.modal;
    if (!m) return;

    // Clean up window-level mouse listeners from drag
    const wrap = this.modalContent?.querySelector('[id^="qa-slides-"]');
    if (wrap?._qaCleanup) wrap._qaCleanup();

    try { m.close(); } catch (_) { }
    m.removeAttribute('open');
    m._qaArrowsInit = false;
    if (this.modalContent) this.modalContent.innerHTML = '';
    document.body.style.overflow = '';
  }

  /* ── Form submit (ATC) ── */
  async _handleFormSubmit(evt) {
    evt.preventDefault();
    const form = evt.target;
    const submitBtn = form.querySelector('[type="submit"]');
    if (!submitBtn || submitBtn.getAttribute('aria-disabled') === 'true') return;

    submitBtn.setAttribute('aria-disabled', 'true');
    submitBtn.classList.add('is-loading');

    // Temporarily enable disabled hidden input so FormData includes it
    const variantInput = form.querySelector('[data-qa-variant-id]');
    if (variantInput) variantInput.disabled = false;
    const formData = new FormData(form);
    if (variantInput) variantInput.disabled = true;

    try {
      const res = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formData,
      });
      const data = await res.json();

      if (!res.ok || data.status) {
        const errWrap = form.querySelector('.product-form__error-message-wrapper');
        if (errWrap) {
          errWrap.removeAttribute('hidden');
          const msgEl = errWrap.querySelector('.product-form__error-message');
          if (msgEl) msgEl.textContent = data.description || data.message || 'Could not add to cart.';
        }
        return;
      }

      this.closeModal();
      this._fireCartEvent(data);

    } catch (err) {
      console.error('[QuickAdd] submit failed:', err);
    } finally {
      submitBtn.classList.remove('is-loading');
      submitBtn.removeAttribute('aria-disabled');
    }
  }

  async _addToCart(id, quantity) {
    const res = await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ id, quantity }] }),
    });
    if (!res.ok) throw new Error('Add to cart failed');
    return res.json();
  }

  _fireCartEvent(cart) {
    document.dispatchEvent(new CustomEvent('cart:item-added', { bubbles: true, detail: { cart } }));
  }
}

(function () {
  if (window.quickAddInstance) return;
  const init = () => { window.quickAddInstance = new QuickAdd(); };
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();