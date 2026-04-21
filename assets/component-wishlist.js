/**
 * component-wishlist.js — VELOURAIX
 * FIXED: heart fill + wishlist page sync
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'velouraix_wishlist';

  function getList() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch (_) { return []; }
  }

  function saveList(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (_) { }
  }

  function isWishlisted(id) {
    return getList().some(function (p) { return String(p.id) === String(id); });
  }

  function addToWishlist(product) {
    var list = getList();
    if (!isWishlisted(product.id)) { list.push(product); saveList(list); }
  }

  function removeFromWishlist(id) {
    saveList(getList().filter(function (p) { return String(p.id) !== String(id); }));
  }

  function toggleWishlist(product) {
    if (isWishlisted(product.id)) { removeFromWishlist(product.id); return false; }
    addToWishlist(product); return true;
  }

  function syncButton(btn) {
    var id = btn.dataset.wishlistId;
    if (!id) return;
    var active = isWishlisted(id);
    btn.classList.toggle('is-wishlisted', active);
    btn.setAttribute('aria-pressed', String(active));
    var label = active
      ? (btn.dataset.labelRemove || 'Remove from wishlist')
      : (btn.dataset.labelAdd || 'Add to wishlist');
    btn.setAttribute('aria-label', label + (btn.dataset.productTitle ? ': ' + btn.dataset.productTitle : ''));
  }

  function syncAll() {
    document.querySelectorAll('[data-wishlist-btn]').forEach(syncButton);
    document.querySelectorAll('[data-wishlist-count]').forEach(function (el) {
      el.textContent = getList().length;
    });
  }

  /* Delegated click — catches dynamic cards injected by recommendations JS */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-wishlist-btn]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    var product = {
      id: btn.dataset.wishlistId || '',
      title: btn.dataset.wishlistTitle || '',
      url: btn.dataset.wishlistUrl || '',
      price: btn.dataset.wishlistPrice || '',
      image: btn.dataset.wishlistImage || '',
      vendor: btn.dataset.wishlistVendor || ''
    };

    var added = toggleWishlist(product);
    syncButton(btn);

    btn.classList.add('wishlist-pulse');
    btn.addEventListener('animationend', function () {
      btn.classList.remove('wishlist-pulse');
    }, { once: true });

    document.querySelectorAll('[data-wishlist-count]').forEach(function (el) {
      el.textContent = getList().length;
    });

    document.dispatchEvent(new CustomEvent('wishlist:changed', {
      bubbles: true,
      detail: { product: product, added: added, list: getList() }
    }));
  });

  /* MutationObserver: re-sync when new cards are injected into DOM */
  var observer = new MutationObserver(function (mutations) {
    var hasNew = mutations.some(function (m) {
      return Array.from(m.addedNodes).some(function (n) {
        return n.nodeType === 1 &&
          (n.matches('[data-wishlist-btn]') || n.querySelector('[data-wishlist-btn]'));
      });
    });
    if (hasNew) syncAll();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  function init() { syncAll(); }
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();

  window.VelouraWishlist = {
    getList: getList,
    isWishlisted: isWishlisted,
    addToWishlist: addToWishlist,
    removeFromWishlist: removeFromWishlist,
    toggleWishlist: toggleWishlist,
    syncAll: syncAll
  };
})();