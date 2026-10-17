function webhookURL(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Enter a valid Discord webhook URL.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'discord.com' || url.username || url.password || url.port || url.search || url.hash
      || !/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[a-zA-Z0-9_-]+$/.test(url.pathname)) {
    throw new Error('Use the HTTPS webhook URL copied from Discord, without query parameters.');
  }
  return url.href;
}
function discordSettings(input, previous = {}) {
  if (!input || typeof input !== 'object') throw new Error('Invalid Discord settings.');
  const result = { enabled: input.enabled === true, sendDemos: input.sendDemos === true };
  for (const kind of ['alerts', 'checkouts']) {
    const value = input[kind];
    if (value !== undefined && typeof value !== 'string') throw new Error('Invalid webhook URL.');
    if (typeof value === 'string' && value.length > 500) throw new Error('Webhook URL is too long.');
    result[kind] = input[`clear${kind}`] === true ? '' : (value?.trim() ? webhookURL(value.trim()) : previous[kind] || '');
  }
  return result;
}
function eventPayload(event) {
  if (!event || !['alerts', 'checkouts'].includes(event.kind)) throw new Error('Unknown Discord event.');
  const test = event.test === true;
  const payload = { allowed_mentions: { parse: [] }, embeds: [{
    title: test ? `TEST — ${event.kind} webhook` : event.kind === 'alerts' ? 'DEMO — Restock simulation' : 'DEMO — Checkout simulation',
    description: test ? 'Orbit Desktop webhook test. No stock was checked and no purchase was made.' : 'Simulated event only. No live stock was checked and no purchase was made.',
    color: event.kind === 'alerts' ? 0xA38BE8 : 0x65BB97,
    footer: { text: 'Orbit Desktop · prototype' }
  }] };
  if (!test) {
    const { product } = require('./retailers.cjs');
    const item = event.item;
    const checked = product(item.url, item.retailer);
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 120 || !Number.isFinite(item.price) || item.price < 0.01 || item.price > 1000000 || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10) throw new Error('Invalid Discord task event.');
    payload.embeds[0].url = checked.url;
    payload.embeds[0].fields = [
      { name: 'Retailer', value: checked.retailer }, { name: 'Product', value: item.name },
      { name: 'Price limit (not observed price)', value: `$${item.price.toFixed(2)}` },
      { name: 'Quantity', value: String(item.quantity) }
    ];
  }
  return payload;
}
async function sendDiscord(settings, event, request = fetch) {
  const payload = eventPayload(event);
  const address = settings[event.kind];
  if (!address) throw new Error(`Save the ${event.kind} webhook first.`);
  const url = webhookURL(address);
  let response;
  try {
    response = await request(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch { throw new Error('Discord delivery was not confirmed. Check your connection; avoid repeated retries because a message may already have been posted.'); }
  if (response.status === 429) throw new Error('Discord rate limit reached. Wait before trying again.');
  if (![200, 204].includes(response.status)) throw new Error(`Discord rejected the message (HTTP ${response.status}). Check or replace the saved webhook.`);
}
module.exports = { webhookURL, discordSettings, eventPayload, sendDiscord };
