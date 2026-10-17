const { product } = require('./retailers.cjs');
function targetURL(input) {
  const checked = product(input, 'Target');
  const tcin = checked.url.match(/\/A-(\d+)(?:[/?#]|$)/)?.[1];
  if (!tcin) throw new Error('Use the full Target product link ending in /A- followed by its TCIN.');
  return { ...checked, tcin };
}
function interpretPage(data, expectedURL) {
  const expected = targetURL(expectedURL);
  if (/access denied|verify (?:that )?you are human|unusual traffic|complete the security check/i.test(data.body || '')) {
    return { availability: 'blocked', price: null, message: 'Target requires attention in the browser. Monitoring stopped.' };
  }
  let actual;
  try { actual = targetURL(data.url); } catch { return { availability: 'unknown', price: null, message: 'The browser is not on the expected product page.' }; }
  if (actual.tcin !== expected.tcin) return { availability: 'unknown', price: null, message: 'The page TCIN does not match the task.' };
  const products = [];
  function walk(node) {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    if ([node['@type']].flat().some(type => /(?:^|\/)Product$/.test(type))) products.push(node);
    if (node['@graph']) walk(node['@graph']);
  }
  for (const document of data.jsonld || []) { try { walk(JSON.parse(document)); } catch {} }
  const matches = products.filter(p => String(p.sku || p.productID || '').replace(/^A-/, '') === expected.tcin || String(p.url || '').includes(`/A-${expected.tcin}`));
  const chosen = matches.length === 1 ? matches[0] : products.length === 1 && !products[0].sku && !products[0].productID && !products[0].url ? products[0] : undefined;
  const offers = chosen ? [chosen.offers].flat().filter(Boolean) : [];
  const offer = offers.length === 1 && !offers[0].offers ? offers[0] : undefined;
  const candidate = offer?.price === '' || offer?.price == null ? NaN : Number(offer.price);
  const price = offer?.priceCurrency === 'USD' && Number.isFinite(candidate) && candidate > 0 ? candidate : null;
  const stock = String(offer?.availability || '').split('/').at(-1);
  const inStock = stock === 'InStock', unavailable = ['OutOfStock', 'SoldOut', 'Discontinued'].includes(stock);
  const availability = inStock && data.canAdd ? 'in-stock' : unavailable && !data.canAdd ? 'out-of-stock' : 'unknown';
  return { tcin: expected.tcin, title: String(chosen?.name || data.title || '').slice(0, 120), price, availability,
    message: availability === 'unknown' ? 'Availability could not be confirmed. Check fulfillment and variants in the browser.' : 'Availability observed on the selected product page; fulfillment/location may change it.' };
}
async function inspectProduct(page, url) {
  const data = await page.evaluate(() => ({
    url: location.href, title: document.querySelector('h1')?.textContent || '', body: document.body.innerText.slice(0, 120000),
    jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(node => node.textContent),
    canAdd: [...document.querySelectorAll('button[data-test="shippingButton"],button[data-test="addToCartButton"]')].some(button => !button.disabled && button.getAttribute('aria-disabled') !== 'true'
      && button.getClientRects().length > 0 && /^(add to cart|ship it|add for shipping)$/i.test((button.getAttribute('aria-label') || button.textContent).trim()))
  }));
  return interpretPage(data, url);
}
module.exports = { targetURL, interpretPage, inspectProduct };
