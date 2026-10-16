const { randomUUID } = require('node:crypto');

function productURL(input) {
  let url;
  try { url = new URL(input); } catch { throw new Error('Enter a valid Target product URL.'); }
  if (url.protocol !== 'https:' || !['target.com', 'www.target.com'].includes(url.hostname)
      || url.username || url.password || url.port || !url.pathname.startsWith('/p/')) {
    throw new Error('Use an HTTPS Target product link starting with /p/.');
  }
  return url.href;
}

function taskInput(input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid task.');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 120) throw new Error('Enter a product name of 1–120 characters.');
  const price = Number(input.price), quantity = Number(input.quantity);
  if (!Number.isFinite(price) || price < 0.01 || price > 1000000) throw new Error('Enter a price limit between $0.01 and $1,000,000.');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw new Error('Quantity must be 1–10.');
  return { name, url: productURL(input.url), price, quantity, automatic: input.automatic === true,
    accountId: typeof input.accountId === 'string' ? input.accountId : '',
    proxyId: typeof input.proxyId === 'string' ? input.proxyId : '' };
}

class TaskEngine {
  constructor(snapshot = {}, changed = () => {}, notify = () => {}, timers = { setTimeout, clearTimeout }) {
    this.changed = changed;
    this.notify = notify;
    this.timers = timers;
    this.jobs = new Map();
    this.items = (Array.isArray(snapshot.items) ? snapshot.items : []).slice(0, 500).map(item => ({
      ...taskInput(item), id: typeof item.id === 'string' ? item.id : randomUUID(),
      state: ['watching', 'checking'].includes(item.state) ? 'paused' : ['ready', 'paused', 'complete'].includes(item.state) ? item.state : 'ready'
    }));
    this.events = (Array.isArray(snapshot.events) ? snapshot.events : []).filter(e =>
      e && typeof e.id === 'string' && typeof e.message === 'string' && typeof e.date === 'string').slice(0, 200);
  }
  snapshot() { return structuredClone({ items: this.items, events: this.events }); }
  publish() { this.changed(this.snapshot()); }
  log(message) {
    this.events.unshift({ id: randomUUID(), date: new Date().toISOString(), message });
    this.events = this.events.slice(0, 200);
    this.publish();
  }
  add(input) {
    if (this.items.length >= 500) throw new Error('Task limit reached (500).');
    const item = { ...taskInput(input), id: randomUUID(), state: 'ready' };
    this.items.push(item);
    this.log(`Added ${item.name}.`);
  }
  find(id) {
    const item = this.items.find(item => item.id === id);
    if (!item) throw new Error('Task no longer exists.');
    return item;
  }
  assign(id, assignment) {
    const item = this.find(id);
    if (this.jobs.has(id)) throw new Error('Stop this task before changing its assignments.');
    Object.assign(item, assignment);
    this.log(`Updated account/proxy assignments for ${item.name}. Configuration only; demo tasks do not use them.`);
  }
  clearReference(key, id) {
    for (const item of this.items) if (item[key] === id) item[key] = '';
    this.publish();
  }
  start(id) {
    const item = this.find(id);
    if (this.jobs.has(id)) return;
    item.state = 'watching';
    this.log(`Demo monitoring started: ${item.name}. No request sent to Target.`);
    const handle = this.timers.setTimeout(() => {
      this.jobs.delete(id);
      this.log(`DEMO restock: ${item.name}. Actual availability is unknown.`);
      this.notify('Demo restock', `${item.name} — simulated availability only.`);
      if (item.automatic) {
        item.state = 'checking';
        this.publish();
        const checkout = this.timers.setTimeout(() => {
          this.jobs.delete(id);
          item.state = 'complete';
          this.log(`DEMO checkout completed: ${item.name}. No purchase was made.`);
          this.notify('Demo checkout', `${item.name} — no purchase was made.`);
        }, 2000);
        this.jobs.set(id, checkout);
      } else { item.state = 'ready'; this.publish(); }
    }, 3000);
    this.jobs.set(id, handle);
  }
  stop(id) {
    const item = this.find(id);
    if (this.jobs.has(id)) this.timers.clearTimeout(this.jobs.get(id));
    this.jobs.delete(id);
    item.state = 'paused';
    this.log(`Paused ${item.name}.`);
  }
  remove(id) {
    const item = this.find(id);
    if (this.jobs.has(id)) this.timers.clearTimeout(this.jobs.get(id));
    this.jobs.delete(id);
    this.items = this.items.filter(item => item.id !== id);
    this.log(`Removed ${item.name}.`);
  }
  close() {
    for (const id of [...this.jobs.keys()]) this.stop(id);
  }
}
module.exports = { productURL, taskInput, TaskEngine };
