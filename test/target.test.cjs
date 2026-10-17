const { test } = require('node:test');
const assert = require('node:assert/strict');
const { targetURL, interpretPage } = require('../src/target-page.cjs');
const { targetState } = require('../src/vault.cjs');
const { proxyOptions } = require('../src/target-browser.cjs');
const { eventPayload } = require('../src/discord.cjs');
const url = 'https://www.target.com/p/example/-/A-12345678';
const item = { name: 'Example', retailer: 'Target', url, price: 30, quantity: 1 };
function data(changes = {}, offer = {}) {
  return { url, title: 'Example', body: 'Product details', canAdd: true,
    jsonld: [JSON.stringify({ '@type': 'Product', sku: '12345678', name: 'Example', offers: { price: '24.99', priceCurrency: 'USD', availability: 'https://schema.org/InStock', ...offer } })], ...changes };
}
test('Target integration requires a precise TCIN and rejects a different product', () => {
  assert.equal(targetURL(url).tcin, '12345678'); assert.throws(() => targetURL('https://target.com/p/no-tcin'));
  assert.equal(interpretPage(data({ url: 'https://target.com/p/other/-/A-87654321' }), url).availability, 'unknown');
});
test('stock requires matching structured data and an enabled purchase control', () => {
  assert.equal(interpretPage(data(), url).availability, 'in-stock');
  assert.equal(interpretPage(data({ canAdd: false }), url).availability, 'unknown');
  assert.equal(interpretPage(data({ canAdd: false }, { availability: 'https://schema.org/OutOfStock' }), url).availability, 'out-of-stock');
  assert.equal(interpretPage(data({}, { availability: 'https://schema.org/PreOrder' }), url).availability, 'unknown');
  assert.equal(interpretPage(data({}, { priceCurrency: 'CAD' }), url).price, null);
});
test('missing data, recommendation products, and challenge pages are never treated as stock', () => {
  assert.equal(interpretPage(data({ jsonld: ['not json'] }), url).availability, 'unknown');
  assert.equal(interpretPage(data({ jsonld: [JSON.stringify({ '@type': 'Product', sku: '99999', offers: { availability: 'InStock' } })] }), url).availability, 'unknown');
  assert.equal(interpretPage(data({ body: 'Verify you are human' }), url).availability, 'blocked');
});
test('saved browser state excludes unrelated domains and origins', () => {
  const state = targetState({ cookies: [{ domain: '.target.com', name: 'session', value: 'secret' }, { domain: 'target.com.evil.test', name: 'bad', value: 'secret' }],
    origins: [{ origin: 'https://www.target.com', localStorage: [] }, { origin: 'https://evil.test', localStorage: [] }] });
  assert.equal(state.cookies.length, 1); assert.equal(state.origins.length, 1);
  assert.throws(() => targetState({ cookies: [] }));
});
test('browser proxy config carries credentials privately and refuses authenticated SOCKS5', () => {
  assert.equal(proxyOptions(), undefined);
  assert.equal(proxyOptions({ protocol: 'http', host: '::1', port: 8080, username: 'u', password: 'p' }).server, 'http://[::1]:8080');
  assert.throws(() => proxyOptions({ protocol: 'socks5', host: 'localhost', port: 8080, username: 'u' }), /authenticated SOCKS5/);
});
test('live checkout messages describe a review, never a confirmed purchase', () => {
  const message = eventPayload({ kind: 'checkouts', live: true, stage: 'review', item, observation: { price: 24.99 } });
  assert.match(message.embeds[0].title, /review/);
  assert.match(message.embeds[0].description, /has not placed or confirmed/);
  assert.throws(() => eventPayload({ kind: 'checkouts', live: true, stage: 'success', item }));
});
