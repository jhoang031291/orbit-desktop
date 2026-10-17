const { test } = require('node:test');
const assert = require('node:assert/strict');
const { product } = require('../src/retailers.cjs');
const { TaskEngine } = require('../src/tasks.cjs');
const { validateAssignment, accountInput } = require('../src/vault.cjs');
const links = {
  'Best Buy US': 'https://www.bestbuy.com/site/example/12345.p',
  Amazon: 'https://www.amazon.com/title/dp/B000000001',
  Target: 'https://www.target.com/p/example',
  Walmart: 'https://www.walmart.com/ip/example/12345'
};
test('recognizes all four US retailers, including legacy Best Buy account names', () => {
  for (const [retailer, url] of Object.entries(links)) assert.equal(product(url, retailer).retailer, retailer);
  assert.equal(accountInput({ label: 'Legacy', retailer: 'Best Buy', username: 'name' }).retailer, 'Best Buy US');
  assert.equal(product('https://amazon.com/gp/product/B000000001').retailer, 'Amazon');
  assert.equal(product('https://bestbuy.com/product/example/123').retailer, 'Best Buy US');
});
test('rejects mismatched retailers, foreign sites, and lookalike hosts', () => {
  assert.throws(() => product(links.Amazon, 'Target'), /match/);
  for (const url of ['https://amazon.co.uk/dp/B000000001', 'https://amazon.com.evil.test/dp/B000000001',
    'https://walmart.com/account', 'https://bestbuy.com/site/account', 'https://amazon.com/dp/invalid', 'https://walmart.com@evil.test/ip/123']) assert.throws(() => product(url));
});
test('each retailer can use only its own saved account; legacy Target tasks still restore', () => {
  for (const retailer of Object.keys(links)) {
    const vault = { accounts: [{ id: 'account', retailer }], proxies: [] };
    assert.deepEqual(validateAssignment({ accountId: 'account' }, vault, retailer), { accountId: 'account', proxyId: '' });
    assert.throws(() => validateAssignment({ accountId: 'account' }, vault, retailer === 'Target' ? 'Amazon' : 'Target'));
  }
  const engine = new TaskEngine({ items: [{ id: 'old', name: 'Old', url: links.Target, price: 20, quantity: 1 }] });
  assert.equal(engine.items[0].retailer, 'Target');
});
test('retailer demo tasks emit separate restock and checkout events', () => {
  const pending = [], events = [];
  const engine = new TaskEngine({}, () => {}, () => {}, { setTimeout: fn => { pending.push(fn); return pending.length; }, clearTimeout: () => {} }, event => events.push(event));
  engine.add({ name: 'Item', url: links.Walmart, retailer: 'Walmart', price: 10, quantity: 1, automatic: true });
  engine.start(engine.items[0].id); pending.shift()(); pending.shift()();
  assert.deepEqual(events.map(event => event.kind), ['alerts', 'checkouts']);
  assert.equal(events[0].item.retailer, 'Walmart');
});
