/**
 * <mega-menu-panel>
 * Hover and keyboard-driven mega menu controller.
 * Fires: modal:opened, modal:closed.
 * Listens: header:offset-changed, pointer and keyboard interactions.
 */
class MegaMenuPanel extends HTMLElement {
  connectedCallback() {
    this._triggers = document.querySelectorAll('[data-mega-trigger]');
    this._panels = this.querySelectorAll('[data-mega-panel]');
    this._backdrop = this.querySelector('[data-mega-close]');
    if (!this._triggers.length || !this._panels.length) return;

    this._activeId = null;
    this._closeTimer = null;
    this._isScrollLocked = false;
    this._onDocumentKeydown = this._onDocumentKeydown.bind(this);
    this._onResize = (window.themeDebounce || ((fn) => fn))(() => this._updateOffset(), 200);
    this._onHeaderOffsetChanged = () => this._updateOffset();
    this._onWindowScroll = this._handleWindowScroll.bind(this);
    this._boundTriggerHandlers = [];
    this._boundPanelHandlers = [];
    this._onBackdropClick = () => this._close();

    this._bindEvents();
    this._updateOffset();
  }

  disconnectedCallback() {
    this._boundTriggerHandlers.forEach(({ trigger, onEnter, onLeave, onKeydown }) => {
      trigger.removeEventListener('mouseenter', onEnter);
      trigger.removeEventListener('mouseleave', onLeave);
      const link = trigger.querySelector('.header-nav__link');
      if (link) link.removeEventListener('keydown', onKeydown);
    });
    this._boundPanelHandlers.forEach(({ panel, onEnter, onLeave }) => {
      panel.removeEventListener('mouseenter', onEnter);
      panel.removeEventListener('mouseleave', onLeave);
    });
    if (this._backdrop) this._backdrop.removeEventListener('click', this._onBackdropClick);
    document.removeEventListener('keydown', this._onDocumentKeydown);
    document.removeEventListener('header:offset-changed', this._onHeaderOffsetChanged);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('scroll', this._onWindowScroll);
    clearTimeout(this._closeTimer);
  }

  _bindEvents() {
    this._triggers.forEach(trigger => {
      const onEnter = () => {
        clearTimeout(this._closeTimer);
        this._open(trigger.dataset.megaTrigger, trigger);
      };
      const onLeave = () => this._startCloseTimer();
      const onKeydown = event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        if (this._activeId === trigger.dataset.megaTrigger) {
          this._close();
          return;
        }
        this._open(trigger.dataset.megaTrigger, trigger);
      };

      trigger.addEventListener('mouseenter', onEnter);
      trigger.addEventListener('mouseleave', onLeave);
      const link = trigger.querySelector('.header-nav__link');
      if (link) link.addEventListener('keydown', onKeydown);
      this._boundTriggerHandlers.push({ trigger, onEnter, onLeave, onKeydown });
    });

    this._panels.forEach(panel => {
      const onEnter = () => clearTimeout(this._closeTimer);
      const onLeave = () => this._startCloseTimer();
      panel.addEventListener('mouseenter', onEnter);
      panel.addEventListener('mouseleave', onLeave);
      this._boundPanelHandlers.push({ panel, onEnter, onLeave });
    });

    if (this._backdrop) this._backdrop.addEventListener('click', this._onBackdropClick);
    document.addEventListener('keydown', this._onDocumentKeydown);
    document.addEventListener('header:offset-changed', this._onHeaderOffsetChanged);
    window.addEventListener('resize', this._onResize, { passive: true });
  }

  _onDocumentKeydown(event) {
    if (event.key !== 'Escape' || !this._activeId) return;
    const activeId = this._activeId;
    this._close();
    const activeTrigger = document.querySelector(`[data-mega-trigger="${activeId}"] .header-nav__link`);
    if (activeTrigger) activeTrigger.focus();
  }

  _updateOffset() {
    const header = document.querySelector('.site-header');
    if (!header) return;
    document.documentElement.style.setProperty('--header-offset', `${header.getBoundingClientRect().height}px`);
  }

  _startCloseTimer() {
    clearTimeout(this._closeTimer);
    this._closeTimer = setTimeout(() => this._close(), 150);
  }

  _open(id, triggerElement) {
    if (!id || this._activeId === id) return;
    this._closeAll(false);
    this._updateOffset();

    const panel = this.querySelector(`[data-mega-panel="${id}"]`);
    if (!panel) return;

    this.classList.add('is-open');
    this.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mega-menu-open');
    document.body.classList.add('overflow-hidden');
    this._isScrollLocked = true;
    window.addEventListener('scroll', this._onWindowScroll, { passive: true });

    panel.classList.add('is-active');
    panel.setAttribute('aria-hidden', 'false');
    if (triggerElement) {
      triggerElement.classList.add('is-mega-active');
      const link = triggerElement.querySelector('.header-nav__link');
      if (link) link.setAttribute('aria-expanded', 'true');
    }

    this._activeId = id;
    document.dispatchEvent(new CustomEvent('modal:opened', { bubbles: true, detail: { id: 'mega-menu' } }));
  }

  _closeAll(resetContainer) {
    this._panels.forEach(panel => {
      panel.classList.remove('is-active');
      panel.setAttribute('aria-hidden', 'true');
    });
    this._triggers.forEach(trigger => {
      trigger.classList.remove('is-mega-active');
      const link = trigger.querySelector('.header-nav__link');
      if (link) link.setAttribute('aria-expanded', 'false');
    });

    if (resetContainer) {
      this.classList.remove('is-open');
      this.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('mega-menu-open');
      document.body.classList.remove('overflow-hidden');
      this._isScrollLocked = false;
      window.removeEventListener('scroll', this._onWindowScroll);
    }

    this._activeId = null;
  }

  _close() {
    clearTimeout(this._closeTimer);
    if (!this._activeId) return;
    this._closeAll(true);
    document.dispatchEvent(new CustomEvent('modal:closed', { bubbles: true, detail: { id: 'mega-menu' } }));
  }

  _handleWindowScroll() {
    // If the user scrolls while the mega menu is open, close it to prevent layout “glitch”.
    // (When body scrolling is locked this should be rare, but it acts as a safety net.)
    if (this._activeId) this._close();
  }
}

customElements.define('mega-menu-panel', MegaMenuPanel);