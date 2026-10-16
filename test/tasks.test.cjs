const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TaskEngine, productURL, taskInput } = require('../src/tasks.cjs');
const input = { name: 'Example collectible', url: 'https://www.target.com/p/example/-/A-123', price: 29.99, quantity: 1, automatic: true };
function fixture() {
  let next = 0; const pending = new Map(), notifications = [];
  const timers = { setTimeout: callback => { pending.set(++next, callback); return next; }, clearTimeout: id => pending.delete(id) };
  const engine = new TaskEngine({}, () => {}, (...args) => notifications.push(args), timers);
  const tick = () => { const [id, callback] = pending.entries().next().value; pending.delete(id); callback(); };
  engine.add(input);
  return { engine, pending, tick, notifications, id: engine.items[0].id };
}
test('reject unsafe links and invalid purchase limits', () => {
  for (const url of ['file:///etc/passwd', 'http://target.com/p/a', 'https://target.com.evil.test/p/a', 'https://evil.test@target.com/p/a', 'https://target.com/account']) {
    assert.throws(() => productURL(url));
  }
  for (const overrides of [{ price: Infinity }, { price: 0 }, { quantity: 1.5 }, { quantity: 11 }, { name: ' ' }]) {
    assert.throws(() => taskInput({ ...input, ...overrides }));
  }
});
test('restock precedes checkout and all notifications declare demo behavior', () => {
  const { engine, tick, id, notifications } = fixture();
  engine.start(id); engine.start(id);
  tick(); assert.equal(engine.find(id).state, 'checking');
  assert.equal(notifications.length, 1);
  tick(); assert.equal(engine.find(id).state, 'complete');
  assert.match(notifications[1][1], /no purchase was made/);
});
test('stop and delete cancel both monitoring and checkout timers', () => {
  for (const phase of ['watching', 'checking']) {
    const { engine, tick, pending, id } = fixture();
    engine.start(id); if (phase === 'checking') tick();
    engine.stop(id); assert.equal(pending.size, 0); assert.equal(engine.find(id).state, 'paused');
    engine.start(id); engine.remove(id); assert.equal(pending.size, 0); assert.equal(engine.items.length, 0);
  }
});
test('alerts-only tasks do not simulate a purchase', () => {
  const { engine, tick, id, notifications, pending } = fixture();
  engine.find(id).automatic = false;
  engine.start(id); tick();
  assert.equal(engine.find(id).state, 'ready'); assert.equal(pending.size, 0); assert.equal(notifications.length, 1);
});
test('restart pauses in-flight tasks; shutdown clears pending work', () => {
  const { engine, id, pending } = fixture(); engine.start(id);
  const restored = new TaskEngine(engine.snapshot()); assert.equal(restored.find(id).state, 'paused');
  engine.close(); assert.equal(pending.size, 0); assert.equal(engine.find(id).state, 'paused');
});
