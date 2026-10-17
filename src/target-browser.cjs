const { chromium } = require('playwright-core');
const { inspectProduct, targetURL } = require('./target-page.cjs');
function proxyOptions(proxy) {
  if (!proxy) return undefined;
  if (proxy.protocol === 'socks5' && (proxy.username || proxy.password)) throw new Error('Chromium does not support authenticated SOCKS5 proxies. Use HTTP/HTTPS or SOCKS5 without authentication.');
  const host = proxy.host.includes(':') ? `[${proxy.host}]` : proxy.host;
  return { server: `${proxy.protocol}://${host}:${proxy.port}`, ...(proxy.username ? { username: proxy.username, password: proxy.password } : {}) };
}
class TargetBrowser {
  constructor({ vault, update, log, onEvent, launch = options => chromium.launch(options) }) {
    Object.assign(this, { vault, update, log, onEvent, launch });
    this.sessions = new Map(); this.closing = false;
  }
  snapshot() {
    return [...this.sessions].map(([accountId, s]) => ({ accountId, proxyId: s.proxyId, status: s.status,
      monitoring: Boolean(s.timer), taskId: s.taskId || '', observation: s.observation || null }));
  }
  session(id) { const s = this.sessions.get(id); if (!s || !s.page || s.page.isClosed()) throw new Error('Open the Target browser for this account first.'); return s; }
  publish() { this.update(); }
  async open(accountId, proxyId = '') {
    if (this.sessions.has(accountId)) throw new Error('Close the existing account browser before reopening it or changing proxies.');
    const account = this.vault.data.accounts.find(a => a.id === accountId && a.retailer === 'Target');
    if (!account) throw new Error('Choose a saved Target account.');
    if (!this.vault.available() || this.vault.locked) throw new Error('Windows credential protection is required for Target sessions.');
    const proxy = proxyId ? this.vault.data.proxies.find(p => p.id === proxyId) : undefined;
    if (proxyId && !proxy) throw new Error('The assigned proxy no longer exists.');
    const s = { proxyId, status: 'Opening', browser: null, timer: null, busy: false, stopped: false };
    this.sessions.set(accountId, s); this.publish();
    try {
      s.browser = await this.launch({ channel: 'msedge', headless: false, chromiumSandbox: true, proxy: proxyOptions(proxy) });
      if (this.closing || s.stopped) { await s.browser.close(); throw new Error('Browser opening was cancelled.'); }
      s.context = await s.browser.newContext({ storageState: this.vault.data.targetSessions?.[accountId] });
      s.context.setDefaultTimeout(12000);
      s.page = await s.context.newPage();
      s.browser.on('disconnected', () => { s.stopped = true; clearTimeout(s.timer); if (this.sessions.get(accountId) === s) this.sessions.delete(accountId); this.publish(); });
      await s.page.goto('https://www.target.com/account', { waitUntil: 'domcontentloaded', timeout: 45000 });
      s.status = 'Sign in in the browser, then save session'; this.publish();
    } catch {
      await s.browser?.close().catch(() => {}); if (this.sessions.get(accountId) === s) this.sessions.delete(accountId); this.publish();
      throw new Error('Target browser could not open. Install or update Microsoft Edge and check the selected proxy. No session was saved.');
    }
  }
  async saveSession(id) {
    const s = this.session(id);
    if (s.busy || s.timer) throw new Error('Stop monitoring before saving a session.');
    await this.vault.saveTargetSession(id, await s.context.storageState());
    s.status = 'Browser state saved; verify sign-in on Target'; this.log('Encrypted Target browser state saved. This does not independently verify sign-in.'); this.publish();
  }
  async check(accountId, item, fromMonitor = false) {
    targetURL(item.url);
    if (item.retailer !== 'Target' || item.accountId !== accountId) throw new Error('Choose a Target task assigned to this account.');
    const s = this.session(accountId);
    if (s.timer && !fromMonitor) throw new Error('Stop monitoring before checking another page.');
    if (item.proxyId !== s.proxyId) throw new Error('The task proxy differs from the browser. Close and reopen with the task proxy.');
    if (s.busy) throw new Error('This account is already checking a page.');
    s.busy = true; s.status = 'Reading Target product page'; this.publish();
    try {
      const response = await s.page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      if (response && response.status() >= 400) throw new Error('Target did not return a readable product page.');
      await s.page.locator('h1').first().waitFor({ timeout: 15000 }).catch(() => {});
      const previous = s.observation;
      s.observation = { ...await inspectProduct(s.page, item.url), taskId: item.id, checkedAt: new Date().toISOString() };
      s.taskId = item.id; s.status = s.observation.message;
      if (s.observation.availability === 'blocked') { clearTimeout(s.timer); s.timer = null; s.stopped = true; }
      if (s.observation.availability === 'in-stock' && s.observation.price != null && s.observation.price <= item.price
          && !(previous?.taskId === item.id && previous.availability === 'in-stock' && previous.price === s.observation.price)) {
        this.onEvent({ kind: 'alerts', live: true, item, observation: s.observation });
      }
      return s.observation;
    } catch {
      s.observation = { taskId: item.id, availability: 'unknown', price: null, checkedAt: new Date().toISOString(), message: 'Product reading failed. Check the visible Target browser; no availability was assumed.' };
      s.status = s.observation.message;
      throw new Error(s.status);
    } finally { s.busy = false; this.publish(); }
  }
  start(accountId, item) {
    const s = this.session(accountId);
    targetURL(item.url);
    if (item.retailer !== 'Target' || item.accountId !== accountId || item.proxyId !== s.proxyId) throw new Error('Choose a Target task assigned to this account and browser proxy.');
    if (s.timer || s.busy) throw new Error('Stop the existing check/monitor first.');
    s.stopped = false; s.taskId = item.id;
    const tick = async () => {
      if (s.stopped || !this.sessions.has(accountId)) return;
      try { await this.check(accountId, item, true); } catch (error) { this.log(error.message); s.stopped = true; }
      if (!s.stopped && this.sessions.has(accountId)) s.timer = setTimeout(tick, 60000);
      else s.timer = null;
      this.publish();
    };
    s.timer = setTimeout(tick, 0); this.publish();
  }
  async stop(accountId) {
    const s = this.session(accountId); s.stopped = true; clearTimeout(s.timer); s.timer = null;
    s.status = s.busy ? 'Stopping current page check' : 'Monitoring stopped';
    if (s.busy) await s.page.goto('about:blank').catch(() => {});
    this.publish();
  }
  async checkout(accountId, item) {
    const s = this.session(accountId);
    if (s.timer || s.busy) throw new Error('Stop monitoring before opening checkout.');
    const observed = await this.check(accountId, item);
    if (observed.availability !== 'in-stock' || observed.price == null || observed.price > item.price) throw new Error('Checkout handoff requires confirmed availability and a current price within the task limit.');
    // Deliberately do not guess cart/quantity/submit selectors on an unverified account page.
    s.status = 'Review product, quantity, shipping, payment, and total in the browser';
    await s.page.bringToFront();
    this.log('Target checkout handoff opened. Add the product and complete checkout in the visible Target browser. No order was submitted by Orbit.');
    this.onEvent({ kind: 'checkouts', live: true, stage: 'review', item, observation: observed });
    this.publish();
  }
  async close(accountId) {
    const s = this.sessions.get(accountId); if (!s) return;
    s.stopped = true; clearTimeout(s.timer); s.timer = null;
    await s.browser?.close().catch(() => {}); if (this.sessions.get(accountId) === s) this.sessions.delete(accountId); this.publish();
  }
  async closeAll() { this.closing = true; await Promise.all([...this.sessions.keys()].map(id => this.close(id))); }
}
module.exports = { TargetBrowser, proxyOptions };
