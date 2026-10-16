const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createNotifier } = require('../src/notifications.cjs');

function fixture({ supported = true, throws = false } = {}) {
  const instances = [], alerts = [], messages = [];
  class Notification extends EventEmitter {
    static isSupported() { return supported; }
    constructor(options) { super(); this.options = options; instances.push(this); }
    show() { if (throws) throw new Error('Failed'); }
  }
  const { notify } = createNotifier({ Notification, emit: alert => alerts.push(alert), log: message => messages.push(message) });
  return { notify, instances, alerts, messages };
}
test('always emit an in-app alert even when native notifications are unsupported', () => {
  const f = fixture({ supported: false }); f.notify('Demo restock', 'Simulated');
  assert.deepEqual(f.alerts, [{ title: 'Demo restock', body: 'Simulated' }]);
  assert.equal(f.instances.length, 0); assert.match(f.messages[0], /unavailable/);
});
test('report asynchronous native failure with useful recovery instructions', () => {
  const f = fixture(); f.notify('Demo checkout', 'No purchase');
  f.instances[0].emit('failed', {}, 'Not registered');
  assert.match(f.messages.at(-1), /Start menu shortcut/);
  assert.equal(f.alerts.at(-1).title, 'Windows notification unavailable');
});
test('a synchronous native failure does not interrupt task execution', () => {
  const f = fixture({ throws: true }); assert.doesNotThrow(() => f.notify('Test', 'Example'));
  assert.match(f.messages[0], /notification failed/); assert.equal(f.alerts.length, 2);
});
test('requests and show events are distinguished from guaranteed user delivery', () => {
  const f = fixture(); f.notify('Test', 'Example');
  assert.match(f.messages[0], /requested/); assert.doesNotMatch(f.messages[0], /shown/);
  f.instances[0].emit('show'); assert.match(f.messages[1], /reported notification shown/);
});
