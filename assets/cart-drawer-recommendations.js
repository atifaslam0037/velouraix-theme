/**
 * Hydrates the "You might also like" strip in the cart drawer via the
 * Product Recommendations JSON API.
 */
(function () {
  function moneyFromCents(cents, format) {
    if (typeof window.Shopify !== 'undefined' && typeof window.Shopify.formatMoney === 'function' && format) {
      try {
        const f = typeof format === 'string' ? JSON.parse(format) : format;
        return window.Shopify.formatMoney(cents, f);
      } catch (_) {
        /* fall through */
      }
    }
    return (Number(cents) / 100).toFixed(2);
  }

  function safeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function productPriceCents(product) {
    const v = product.price_min || product.price || product.variants?.[0]?.price;
    return Number(v) || 0;
  }

  function productImage(product) {
    if (product.featured_image) return product.featured_image;
    const im = product.images?.[0];
    if (typeof im === 'string') return im;
    return im?.src || '';
  }

  function productUrl(product) {
    if (product.url) return product.url;
    return '#';
  }

  function renderCard(product, moneyFormat) {
    const cents = productPriceCents(product);
    const img = productImage(product);
    const title = safeText(product.title);

    const wrap = document.createElement('div');
    wrap.className = 'cart-upsell-item';

    const link = document.createElement('a');
    link.className = 'cart-upsell-item__link';
    link.href = productUrl(product);

    const imageWrap = document.createElement('span');
    imageWrap.className = 'cart-upsell-item__image-wrap';

    if (img) {
      const image = document.createElement('img');
      image.className = 'cart-upsell-item__img';
      image.src = img;
      image.alt = '';
      image.setAttribute('role', 'presentation');
      image.loading = 'lazy';
      image.width = 120;
      image.height = 150;
      imageWrap.appendChild(image);
    } else {
      const placeholder = document.createElement('span');
      placeholder.className = 'cart-upsell-item__image-ph';
      imageWrap.appendChild(placeholder);
    }

    const titleEl = document.createElement('span');
    titleEl.className = 'cart-upsell-item__title';
    titleEl.textContent = title;

    const priceEl = document.createElement('span');
    priceEl.className = 'cart-upsell-item__price';
    priceEl.textContent = moneyFromCents(cents, moneyFormat);

    link.appendChild(imageWrap);
    link.appendChild(titleEl);
    link.appendChild(priceEl);
    wrap.appendChild(link);

    return wrap;
  }

  function load(container) {
    const base = container.dataset.recommendationsUrl;
    const productId = container.dataset.productId;
    if (!base || !productId) return;

    const jsonUrl = base.includes('.json') ? base : `${base}.json`;
    const url = `${jsonUrl}?product_id=${encodeURIComponent(productId)}&limit=4&intent=related`;
    const drawer = document.querySelector('[data-money-format]');
    const moneyFormat = drawer?.dataset?.moneyFormat;

    fetch(url, { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((data) => {
        const products = data.products || [];
        container.replaceChildren();
        if (products.length === 0) {
          container.closest('.cart-drawer__upsell')?.classList.add('is-empty');
          return;
        }
        products.forEach((p) => container.appendChild(renderCard(p, moneyFormat)));
      })
      .catch(() => {
        container.closest('.cart-drawer__upsell')?.classList.add('is-empty');
      });
  }

  function initAll() {
    document.querySelectorAll('.cart-drawer__upsell-recs[data-product-id]').forEach(load);
  }

  document.addEventListener('cart:opened', initAll);
  document.addEventListener('cart:drawer-refreshed', initAll);
  document.addEventListener('DOMContentLoaded', initAll);
})();
