const { test } = require('node:test');
const assert = require('node:assert/strict');
const { webhookURL, discordSettings, eventPayload, sendDiscord } = require('../src/discord.cjs');
const settings = { alerts: 'https://discord.com/api/webhooks/123456/test_alert_token', checkouts: 'https://discord.com/api/webhooks/654321/test_checkout_token' };
const item = { name: '@everyone collectible', url: 'https://target.com/p/example', retailer: 'Target', price: 20, quantity: 1,
  password: 'must-not-send', proxyId: 'private-proxy', accountId: 'private-account' };
test('webhooks require the exact Discord HTTPS endpoint and no credential-bearing redirects', () => {
  assert.equal(webhookURL(settings.alerts), settings.alerts);
  for (const url of ['http://discord.com/api/webhooks/1/a', 'https://discord.com.evil.test/api/webhooks/1/a',
    'https://user:pass@discord.com/api/webhooks/1/a', 'https://discord.com/api/webhooks/1/a?token=1', 'https://discord.com/api/webhooks/1/a#token',
    'https://discord.com/channels/1/2', 'https://discord.com:8443/api/webhooks/1/a']) assert.throws(() => webhookURL(url));
});
test('blank settings preserve webhooks, explicit removal clears them, demos default off', () => {
  const preserved = discordSettings({}, settings);
  assert.equal(preserved.alerts, settings.alerts); assert.equal(preserved.sendDemos, false); assert.equal(preserved.enabled, false);
  assert.equal(discordSettings({ clearalerts: true }, settings).alerts, '');
  assert.throws(() => discordSettings({ alerts: 'https://evil.test/' }));
});
test('Discord messages are labeled demo and do not include account/proxy fields or mentions', () => {
  for (const kind of ['alerts', 'checkouts']) {
    const body = eventPayload({ kind, item });
    assert.match(body.embeds[0].title, /DEMO/); assert.deepEqual(body.allowed_mentions, { parse: [] });
    assert.match(body.embeds[0].description, /no purchase was made/);
    const raw = JSON.stringify(body);
    for (const secret of ['must-not-send', 'private-proxy', 'private-account']) assert(!raw.includes(secret));
  }
  assert.match(eventPayload({ kind: 'alerts', test: true }).embeds[0].title, /TEST/);
});
test('routes each event to its own webhook and never follows redirects', async () => {
  const calls = [];
  const request = async (...args) => { calls.push(args); return { status: 204 }; };
  for (const kind of ['alerts', 'checkouts']) {
    await sendDiscord(settings, { kind, item }, request);
    assert.equal(calls.at(-1)[0], settings[kind]); assert.equal(calls.at(-1)[1].redirect, 'error');
  }
});
test('failures are sanitized and never automatically retried', async () => {
  let calls = 0;
  await assert.rejects(sendDiscord(settings, { kind: 'alerts', item }, async () => { calls++; throw new Error(settings.alerts); }), error => {
    assert(!error.message.includes('test_alert_token')); return /not confirmed/.test(error.message);
  });
  assert.equal(calls, 1);
  await assert.rejects(sendDiscord(settings, { kind: 'alerts', item }, async () => ({ status: 429 })), /rate limit/);
  await assert.rejects(sendDiscord(settings, { kind: 'alerts', item }, async () => ({ status: 404 })), /HTTP 404/);
  await assert.rejects(sendDiscord({}, { kind: 'alerts', test: true }), /Save/);
});
