/**
 * @element product-media-gallery
 * @description Main product media gallery. Handles thumbnails, main viewer,
 *   image zoom, video/external-video playback, 3D model (model-viewer + Shopify XR),
 *   variant-driven media switching, and keyboard/touch navigation.
 *
 * @fires product:media-changed  — when active media changes { detail: { mediaId } }
 * @listens product:variant-changed — switches to variant featured image
 * @listens modal:closed            — pauses all media when modal closes
 */

'use strict';

/* ─────────────────────────────────────────────
   UTILITY — pause every playing media element
   on the page (video, model-viewer, external)
───────────────────────────────────────────── */
function pauseAllMedia() {
  document.querySelectorAll('.js-youtube, .js-vimeo').forEach((video) => {
    video.contentWindow.postMessage(
      JSON.stringify({ event: 'command', func: 'pauseVideo' }),
      '*'
    );
  });
  document.querySelectorAll('video').forEach((video) => video.pause());
  document.querySelectorAll('model-viewer').forEach((model) => {
    model.dismissPoster?.();
    const playButton = model.querySelector('.model-viewer__button');
    if (playButton) playButton.setAttribute('aria-expanded', 'false');
  });
}

/* ─────────────────────────────────────────────
   DEFERRED MEDIA — lazy-loads iframe/video src
   only when the user explicitly plays it
───────────────────────────────────────────── */
class DeferredMedia extends HTMLElement {
  connectedCallback() {
    const trigger = this.querySelector('[data-deferred-trigger]');
    if (!trigger) return;
    trigger.addEventListener('click', this._load.bind(this), { once: true });
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this._load();
      }
    }, { once: true });
  }

  _load() {
    pauseAllMedia();
    const template = this.querySelector('template');
    if (!template) return;
    const clone = template.content.cloneNode(true);
    this.appendChild(clone);
    this.classList.add('deferred-media--loaded');

    const iframe = this.querySelector('iframe');
    const video = this.querySelector('video');
    if (iframe) iframe.focus();
    if (video) {
      video.play().catch(() => { });
      video.focus();
    }
  }
}
if (!customElements.get('deferred-media')) {
  customElements.define('deferred-media', DeferredMedia);
}

/* ─────────────────────────────────────────────
   PRODUCT MEDIA ZOOM — pinch & click zoom
   on the main product image
───────────────────────────────────────────── */
class ProductMediaZoom extends HTMLElement {
  connectedCallback() {
    this._img = this.querySelector('[data-zoom-image]');
    this._lens = this.querySelector('[data-zoom-lens]');
    this._isActive = false;

    if (!this._img) return;

    this._onEnter = this._handleEnter.bind(this);
    this._onLeave = this._handleLeave.bind(this);
    this._onMove = this._handleMove.bind(this);
    this._onTouch = this._handleTouch.bind(this);

    this.addEventListener('mouseenter', this._onEnter);
    this.addEventListener('mouseleave', this._onLeave);
    this.addEventListener('mousemove', this._onMove);
    this.addEventListener('touchstart', this._onTouch, { passive: true });
  }

  disconnectedCallback() {
    this.removeEventListener('mouseenter', this._onEnter);
    this.removeEventListener('mouseleave', this._onLeave);
    this.removeEventListener('mousemove', this._onMove);
    this.removeEventListener('touchstart', this._onTouch);
  }

  _handleEnter() {
    if (window.matchMedia('(hover: none)').matches) return;
    this._isActive = true;
    this.classList.add('is-zooming');
    if (this._lens) this._lens.style.visibility = 'visible';
  }

  _handleLeave() {
    this._isActive = false;
    this.classList.remove('is-zooming');
    if (this._lens) this._lens.style.visibility = 'hidden';
    this._img.style.transformOrigin = '';
    this._img.style.transform = '';
  }

  _handleMove(e) {
    if (!this._isActive) return;
    const rect = this.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    this._img.style.transformOrigin = `${x}% ${y}%`;
    this._img.style.transform = 'scale(2)';
    if (this._lens) {
      this._lens.style.left = `${e.clientX - rect.left - 40}px`;
      this._lens.style.top = `${e.clientY - rect.top - 40}px`;
    }
  }

  _handleTouch(e) {
    if (e.touches.length < 2) return;
    this.classList.toggle('is-zooming');
  }
}
if (!customElements.get('product-media-zoom')) {
  customElements.define('product-media-zoom', ProductMediaZoom);
}

/* ─────────────────────────────────────────────
   PRODUCT MEDIA GALLERY — main orchestrator
───────────────────────────────────────────── */
class ProductMediaGallery extends HTMLElement {

  /* ── lifecycle ─────────────────────────── */
  connectedCallback() {
    this._viewer = this.querySelector('[data-gallery-viewer]');
    this._thumbTrack = this.querySelector('[data-gallery-thumbs]');
    this._liveRegion = this.querySelector('[data-gallery-live-region]');
    this._xrButton = this.querySelector('[data-shopify-xr]');

    if (!this._viewer) return;

    this._slides = Array.from(this._viewer.querySelectorAll('[data-media-id]'));
    this._thumbBtns = this._thumbTrack
      ? Array.from(this._thumbTrack.querySelectorAll('[data-thumb-target]'))
      : [];
    this._currentIdx = 0;
    this._touchStartX = 0;
    this._touchStartY = 0;

    this._bindEvents();
    this._activateSlide(0, false);
  }

  disconnectedCallback() {
    document.removeEventListener('product:variant-changed', this._onVariantChanged);
    document.removeEventListener('modal:closed', this._onModalClosed);
    this._viewer?.removeEventListener('keydown', this._onKeydown);
    this._viewer?.removeEventListener('touchstart', this._onTouchStart);
    this._viewer?.removeEventListener('touchend', this._onTouchEnd);
  }

  /* ── event wiring ──────────────────────── */
  _bindEvents() {
    // Thumbnail clicks
    this._thumbBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.thumbTarget;
        const idx = this._slides.findIndex((s) => s.dataset.mediaId === id);
        if (idx !== -1) this._activateSlide(idx, true);
      });
    });

    // Keyboard navigation on viewer
    this._onKeydown = this._handleKeydown.bind(this);
    this._viewer.addEventListener('keydown', this._onKeydown);

    // Touch swipe on viewer
    this._onTouchStart = (e) => {
      this._touchStartX = e.touches[0].clientX;
      this._touchStartY = e.touches[0].clientY;
    };
    this._onTouchEnd = (e) => {
      const dx = e.changedTouches[0].clientX - this._touchStartX;
      const dy = e.changedTouches[0].clientY - this._touchStartY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
        dx < 0 ? this._next() : this._prev();
      }
    };
    this._viewer.addEventListener('touchstart', this._onTouchStart, { passive: true });
    this._viewer.addEventListener('touchend', this._onTouchEnd, { passive: true });

    // Listen for variant change from product form
    this._onVariantChanged = this._handleVariantChanged.bind(this);
    document.addEventListener('product:variant-changed', this._onVariantChanged);

    // Pause media when modal closes
    this._onModalClosed = () => pauseAllMedia();
    document.addEventListener('modal:closed', this._onModalClosed);
  }

  /* ── keyboard ──────────────────────────── */
  _handleKeydown(e) {
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        this._prev();
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        this._next();
        break;
      case 'Home':
        e.preventDefault();
        this._activateSlide(0, true);
        break;
      case 'End':
        e.preventDefault();
        this._activateSlide(this._slides.length - 1, true);
        break;
    }
  }

  /* ── navigation helpers ────────────────── */
  _prev() {
    const idx = (this._currentIdx - 1 + this._slides.length) % this._slides.length;
    this._activateSlide(idx, true);
  }

  _next() {
    const idx = (this._currentIdx + 1) % this._slides.length;
    this._activateSlide(idx, true);
  }

  /* ── core: activate a slide by index ──── */
  _activateSlide(idx, announce) {
    if (idx < 0 || idx >= this._slides.length) return;

    pauseAllMedia();

    // Deactivate all
    this._slides.forEach((slide) => {
      slide.classList.remove('is-active');
      slide.setAttribute('aria-hidden', 'true');
      slide.setAttribute('tabindex', '-1');
    });

    // Activate target
    const active = this._slides[idx];
    active.classList.add('is-active');
    active.removeAttribute('aria-hidden');
    active.setAttribute('tabindex', '0');
    this._currentIdx = idx;

    // Scroll into view on mobile (horizontal scroll track)
    active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });

    // Sync thumbnails
    this._syncThumbs(active.dataset.mediaId);

    // Update XR button for 3D models
    this._syncXRButton(active);

    // Auto-play deferred video if it was pre-loaded
    const video = active.querySelector('video');
    if (video && active.classList.contains('deferred-media--loaded')) {
      video.play().catch(() => { });
    }

    // Announce to screen readers
    if (announce && this._liveRegion) {
      const position = idx + 1;
      const total = this._slides.length;
      this._liveRegion.textContent = '';
      requestAnimationFrame(() => {
        this._liveRegion.textContent =
          `${active.dataset.mediaAlt || 'Media'} — ${position} of ${total}`;
      });
    }

    // Dispatch cross-component event
    document.dispatchEvent(
      new CustomEvent('product:media-changed', {
        bubbles: true,
        detail: { mediaId: active.dataset.mediaId },
      })
    );
  }

  /* ── sync thumbnail active state ───────── */
  _syncThumbs(mediaId) {
    this._thumbBtns.forEach((btn) => {
      const isActive = btn.dataset.thumbTarget === mediaId;
      btn.setAttribute('aria-current', isActive ? 'true' : 'false');
      btn.classList.toggle('is-active', isActive);
    });

    // Scroll active thumb into view inside the thumb track
    if (this._thumbTrack) {
      const activeThumb = this._thumbTrack.querySelector('[aria-current="true"]');
      if (activeThumb) {
        activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    }
  }

  /* ── 3D model XR button visibility ─────── */
  _syncXRButton(activeSlide) {
    if (!this._xrButton) return;

    const mediaType = activeSlide.dataset.mediaType;

    // Show XR button if current slide is a model, or if any model exists
    if (mediaType === 'model') {
      this._xrButton.removeAttribute('hidden');
      this._xrButton.dataset.shopifyModel3dId = activeSlide.dataset.mediaId;
    } else {
      const hasAnyModel = this._slides.some((s) => s.dataset.mediaType === 'model');
      if (hasAnyModel) {
        const firstModel = this._slides.find((s) => s.dataset.mediaType === 'model');
        this._xrButton.removeAttribute('hidden');
        this._xrButton.dataset.shopifyModel3dId = firstModel.dataset.mediaId;
      } else {
        this._xrButton.setAttribute('hidden', '');
      }
    }
  }

  /* ── variant changed: switch to variant media ─ */
  _handleVariantChanged(e) {
    const { variant, form } = e.detail || {};
    if (!variant || !variant.featured_media) return;

    // Only respond to the form inside the same product section
    const sectionId = this.closest('[data-section-id]')?.dataset.sectionId;
    if (form && sectionId) {
      const formSection = form.closest('[data-section-id]')?.dataset.sectionId;
      if (formSection && formSection !== sectionId) return;
    }

    const mediaId = String(variant.featured_media.id);
    const idx = this._slides.findIndex((s) => s.dataset.mediaId === mediaId);

    if (idx !== -1) {
      this._activateSlide(idx, false);
    }
  }

  /* ── public API for external callers ───── */
  switchMedia(mediaId) {
    const idx = this._slides.findIndex((s) => s.dataset.mediaId === mediaId);
    if (idx !== -1) this._activateSlide(idx, true);
  }
}

if (!customElements.get('product-media-gallery')) {
  customElements.define('product-media-gallery', ProductMediaGallery);
}
