const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { isIP } = require('node:net');
const { RETAILERS, normalizeRetailer } = require('./retailers.cjs');
const { discordSettings } = require('./discord.cjs');
const retailers = [...RETAILERS, 'Other'];
function field(value, name, max = 120, required = true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`Invalid ${name}.`);
  return value.trim();
}
function credential(input, previous = {}) {
  if (input.clearPassword === true) return '';
  if (input.password === undefined || input.password === '') return previous.password || '';
  if (typeof input.password !== 'string' || input.password.length > 2048) throw new Error('Invalid password.');
  return input.password;
}
function accountInput(input, previous) {
  if (!input || !retailers.includes(normalizeRetailer(input.retailer))) throw new Error('Choose a retailer.');
  return { label: field(input.label, 'account label'), retailer: normalizeRetailer(input.retailer),
    username: field(input.username, 'email or username', 254), password: credential(input, previous) };
}
function proxyInput(input, previous) {
  if (!input || !['http', 'https', 'socks5'].includes(input.protocol)) throw new Error('Choose HTTP, HTTPS, or SOCKS5.');
  const host = field(input.host, 'proxy host', 253);
  if (!isIP(host) && !host.split('.').every(part => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(part))) {
    throw new Error('Enter a hostname or IP address without a URL, port, or credentials.');
  }
  const port = Number(input.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Proxy port must be 1–65535.');
  const username = field(input.username ?? '', 'proxy username', 254, false), password = credential(input, previous);
  if (password && !username) throw new Error('Enter a proxy username or clear its saved password.');
  return { label: field(input.label, 'proxy label'), protocol: input.protocol, host, port, username, password };
}
class Vault {
  constructor(file, crypto) {
    this.file = file; this.crypto = crypto; this.data = { accounts: [], proxies: [], discord: discordSettings({}) }; this.locked = false;
    this.pending = Promise.resolve();
  }
  available() {
    return this.crypto.isEncryptionAvailable() && this.crypto.getSelectedStorageBackend?.() !== 'basic_text';
  }
  async load() {
    try {
      const encrypted = await fs.readFile(this.file);
      if (!this.available()) throw new Error('Encryption unavailable');
      const data = JSON.parse(this.crypto.decryptString(encrypted));
      data.discord = discordSettings(data.discord || {}, data.discord || {});
      for (const key of ['alerts', 'checkouts']) if (data.discord[key]) data.discord[key] = require('./discord.cjs').webhookURL(data.discord[key]);
      if (!Array.isArray(data.accounts) || !Array.isArray(data.proxies) || data.accounts.length > 500 || data.proxies.length > 500) throw new Error('Invalid vault');
      for (const [kind, validate] of [['accounts', accountInput], ['proxies', proxyInput]]) {
        const ids = new Set();
        data[kind] = data[kind].map(entry => {
          const id = field(entry.id, 'entry ID');
          if (ids.has(id)) throw new Error('Duplicate entry');
          ids.add(id);
          return { ...validate(entry), id };
        });
      }
      this.data = data;
    } catch (error) {
      if (error.code === 'ENOENT') return;
      this.locked = true;
      throw new Error('Accounts/proxies could not be unlocked. Use the same Windows user and computer. The saved file is preserved; account/proxy changes are disabled.');
    }
  }
  snapshot() {
    const redact = ({ password, ...entry }) => ({ ...entry, hasPassword: Boolean(password) });
    return { accounts: this.data.accounts.map(redact), proxies: this.data.proxies.map(redact), discord: {
      enabled: this.data.discord.enabled, sendDemos: this.data.discord.sendDemos,
      alertsConfigured: Boolean(this.data.discord.alerts), checkoutsConfigured: Boolean(this.data.discord.checkouts)
    } };
  }
  mutate(operation) {
    const result = this.pending.then(async () => {
      if (this.locked || !this.available()) throw new Error('Windows credential protection is unavailable. No credentials were saved.');
      const next = structuredClone(this.data);
      operation(next);
      const encrypted = this.crypto.encryptString(JSON.stringify(next));
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      await fs.writeFile(this.file + '.tmp', encrypted);
      await fs.rename(this.file + '.tmp', this.file);
      this.data = next;
    });
    this.pending = result.catch(() => {});
    return result;
  }
  save(kind, input) {
    if (!['accounts', 'proxies'].includes(kind)) return Promise.reject(new Error('Invalid entry type.'));
    return this.mutate(data => {
      const existing = input?.id ? data[kind].find(entry => entry.id === input.id) : undefined;
      if (input?.id && !existing) throw new Error('Entry no longer exists.');
      if (!existing && data[kind].length >= 500) throw new Error('Entry limit reached (500).');
      const validate = kind === 'accounts' ? accountInput : proxyInput;
      const entry = { ...validate(input, existing), id: existing?.id || randomUUID() };
      if (existing) data[kind][data[kind].indexOf(existing)] = entry;
      else data[kind].push(entry);
    });
  }
  remove(kind, id) {
    if (!['accounts', 'proxies'].includes(kind)) return Promise.reject(new Error('Invalid entry type.'));
    return this.mutate(data => {
      if (!data[kind].some(entry => entry.id === id)) throw new Error('Entry no longer exists.');
      data[kind] = data[kind].filter(entry => entry.id !== id);
    });
  }
  saveDiscord(input) { return this.mutate(data => { data.discord = discordSettings(input, data.discord); }); }
}
function validateAssignment(input, vault, retailer = 'Target') {
  const accountId = typeof input.accountId === 'string' ? input.accountId : '';
  const proxyId = typeof input.proxyId === 'string' ? input.proxyId : '';
  if (accountId && !vault.accounts.some(entry => entry.id === accountId && entry.retailer === retailer)) throw new Error(`Choose a saved ${retailer} account.`);
  if (proxyId && !vault.proxies.some(entry => entry.id === proxyId)) throw new Error('Choose a saved proxy.');
  return { accountId, proxyId };
}
module.exports = { Vault, accountInput, proxyInput, validateAssignment };
