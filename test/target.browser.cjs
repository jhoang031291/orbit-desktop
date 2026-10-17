const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const { inspectProduct } = require('../src/target-page.cjs');
const { TargetBrowser } = require('../src/target-browser.cjs');
const path = require('node:path');
const fs = require('node:fs/promises');
const url = 'https://www.target.com/p/example/-/A-12345678';
const productData = { '@type': 'Product', sku: '12345678', name: 'Example', offers: { price: 24.99, priceCurrency: 'USD', availability: 'https://schema.org/InStock' } };
function html({ disabled = false, data = productData, body = '' } = {}) {
  return `<h1>Example product</h1><p>${body}</p><script type="application/ld+json">${JSON.stringify(data)}</script><button data-test="shippingButton" ${disabled ? 'disabled' : ''}>Add to cart</button>`;
}
test('Playwright reads Target-shaped browser fixtures without making retailer requests', async t => {
  const browser = await chromium.launch({ headless: true, ...(process.env.ORBIT_TEST_CHROMIUM ? { executablePath: process.env.ORBIT_TEST_CHROMIUM } : { channel: 'msedge' }) });
  t.after(() => browser.close());
  const page = await browser.newPage(); let fixture = html();
  await page.route('**/*', route => route.fulfill({ status: 200, contentType: 'text/html', body: fixture }));
  await page.goto(url);
  assert.equal((await inspectProduct(page, url)).availability, 'in-stock');
  fixture = html({ disabled: true }); await page.reload();
  assert.equal((await inspectProduct(page, url)).availability, 'unknown');
  fixture = html({ body: 'Verify you are human' }); await page.reload();
  assert.equal((await inspectProduct(page, url)).availability, 'blocked');
});
test('browser workspace enforces account/proxy matching and never clicks a purchase control', async t => {
  const browser = await chromium.launch({ headless: true, ...(process.env.ORBIT_TEST_CHROMIUM ? { executablePath: process.env.ORBIT_TEST_CHROMIUM } : { channel: 'msedge' }) });
  t.after(() => browser.close());
  const context = await browser.newContext();
  await context.route('**/*', route => route.fulfill({ status: 200, contentType: 'text/html', body: html() + '<script>window.purchaseClicks=0;document.querySelector("button").onclick=()=>window.purchaseClicks++</script>' }));
  const events = [];
  const manager = new TargetBrowser({ vault: { data: {} }, update: () => {}, log: () => {}, onEvent: event => events.push(event) });
  const page = await context.newPage();
  manager.sessions.set('a', { browser, context, page, proxyId: '', timer: null, busy: false });
  const item = { id: 'task', accountId: 'a', proxyId: '', retailer: 'Target', name: 'Example', url, price: 30, quantity: 1 };
  await manager.check('a', item); await manager.check('a', item);
  assert.equal(events.filter(e => e.kind === 'alerts').length, 1);
  await assert.rejects(manager.check('a', { ...item, proxyId: 'other' }), /proxy differs/);
  await assert.rejects(manager.checkout('a', { ...item, price: 5 }), /within the task limit/);
  await manager.checkout('a', item);
  assert.equal(await page.evaluate(() => window.purchaseClicks), 0);
  assert.equal(events.at(-1).stage, 'review');
  await manager.closeAll(); assert.equal(manager.snapshot().length, 0);
});
test('desktop Target controls render and send account-scoped commands', async t => {
  const browser = await chromium.launch({ headless: true, ...(process.env.ORBIT_TEST_CHROMIUM ? { executablePath: process.env.ORBIT_TEST_CHROMIUM } : { channel: 'msedge' }) });
  t.after(() => browser.close());
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.calls = [];
    const state = { items: [{ id: 'task', name: 'Product', retailer: 'Target', url: 'https://target.com/p/name/-/A-12345678', price: 30, quantity: 1, state: 'ready', accountId: 'account', proxyId: '' }],
      events: [], accounts: [{ id: 'account', label: 'My account', username: 'example', retailer: 'Target', hasPassword: false, hasTargetSession: false }], proxies: [], discord: {}, targetBrowsers: [] };
    window.orbit = { onState() {}, onSaveError() {}, onNotification() {}, command: async (command, data) => {
      window.calls.push({ command, data });
      if (command === 'target-open') state.targetBrowsers = [{ accountId: data.accountId, proxyId: '', status: 'Sign in in the browser', monitoring: false }];
      return { ok: true, state };
    } };
  });
  await page.route('https://orbit.test/**', async route => {
    const file = new URL(route.request().url()).pathname.slice(1) || 'index.html';
    if (!['index.html', 'styles.css', 'renderer.js'].includes(file)) return route.abort();
    await route.fulfill({ status: 200, contentType: file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'application/javascript' : 'text/html', body: await fs.readFile(path.join(__dirname, '../src', file)) });
  });
  await page.goto('https://orbit.test/index.html');
  await page.getByRole('button', { name: 'Target Live', exact: false }).click();
  await page.locator('#live-account').selectOption('account');
  await page.locator('#live-task').selectOption('task');
  await page.locator('#live-open').click();
  await page.waitForFunction(() => document.querySelector('#live-status').textContent.includes('Sign in in the browser'));
  assert.deepEqual(await page.evaluate(() => window.calls.find(c => c.command === 'target-open').data), { accountId: 'account', proxyId: '' });
  assert.equal(await page.locator('#live-check').isEnabled(), true);
  assert.deepEqual(errors, []);
});
