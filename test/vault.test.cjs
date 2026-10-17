const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
const { Vault, proxyInput, validateAssignment } = require('../src/vault.cjs');
const { TaskEngine } = require('../src/tasks.cjs');
const account = { label: 'Personal', retailer: 'Target', username: 'person@example.com', password: 'private-password' };
const proxy = { label: 'Primary', protocol: 'http', host: 'proxy.example.com', port: 8080, username: 'user', password: 'proxy-secret' };
// Test adapter uses real encryption; Electron safeStorage / Windows DPAPI still needs device validation.
function adapter() {
  const key = randomBytes(32);
  return {
    isEncryptionAvailable: () => true,
    encryptString: value => {
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), data]);
    },
    decryptString: bytes => {
      const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
    }
  };
}
async function fixture(t, crypto = adapter()) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-vault-'));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const vault = new Vault(path.join(folder, 'credentials.enc'), crypto);
  await vault.load();
  return vault;
}
test('encrypted vault survives reload without returning passwords to the renderer', async t => {
  const vault = await fixture(t);
  await Promise.all([vault.save('accounts', account), vault.save('proxies', proxy)]);
  const bytes = await fs.readFile(vault.file);
  for (const secret of [account.password, account.username, proxy.password]) assert(!bytes.includes(Buffer.from(secret)));
  const publicData = JSON.stringify(vault.snapshot());
  assert(!publicData.includes(account.password)); assert(!publicData.includes(proxy.password));
  assert.equal(vault.snapshot().accounts[0].hasPassword, true);
  const reload = new Vault(vault.file, vault.crypto); await reload.load();
  assert.deepEqual(reload.snapshot(), vault.snapshot());
});
test('editing preserves, replaces, and explicitly clears credentials', async t => {
  const vault = await fixture(t); await vault.save('accounts', account);
  const entry = vault.snapshot().accounts[0];
  await vault.save('accounts', { ...entry, password: '', label: 'Renamed' });
  assert.equal(vault.data.accounts[0].password, account.password);
  await vault.save('accounts', { ...entry, password: 'replacement' });
  assert.equal(vault.data.accounts[0].password, 'replacement');
  await vault.save('accounts', { ...entry, password: '', clearPassword: true });
  assert.equal(vault.snapshot().accounts[0].hasPassword, false);
});
test('unavailable or insecure encryption refuses to persist credentials', async t => {
  for (const overrides of [{ isEncryptionAvailable: () => false }, { getSelectedStorageBackend: () => 'basic_text' }]) {
    const vault = await fixture(t, { ...adapter(), ...overrides });
    await assert.rejects(vault.save('accounts', account), /credential protection/);
    assert.equal(vault.snapshot().accounts.length, 0);
    await assert.rejects(fs.readFile(vault.file), { code: 'ENOENT' });
  }
});
test('unreadable encrypted data is preserved and cannot be overwritten', async t => {
  const vault = await fixture(t); await vault.save('accounts', account);
  const original = await fs.readFile(vault.file);
  const wrongUser = new Vault(vault.file, adapter());
  await assert.rejects(wrongUser.load(), /same Windows user/);
  await assert.rejects(wrongUser.save('accounts', account), /credential protection/);
  assert.deepEqual(await fs.readFile(vault.file), original);
});
test('proxy validation rejects malformed hosts, invalid ports and credentials without a username', () => {
  for (const update of [{ host: 'https://proxy.test' }, { host: 'user:pass@proxy.test' }, { host: 'proxy.test:80' },
    { port: 0 }, { port: 65536 }, { port: 1.5 }, { protocol: 'ftp' }, { username: '' }]) {
    assert.throws(() => proxyInput({ ...proxy, ...update }));
  }
  assert.equal(proxyInput({ ...proxy, host: '::1', protocol: 'socks5' }).host, '::1');
});
test('assignments accept Target accounts only and require existing proxies', async t => {
  const vault = await fixture(t); await vault.save('accounts', account); await vault.save('proxies', proxy);
  const data = vault.snapshot(), assignment = { accountId: data.accounts[0].id, proxyId: data.proxies[0].id };
  assert.deepEqual(validateAssignment(assignment, data), assignment);
  assert.throws(() => validateAssignment({ accountId: 'unknown' }, data));
  assert.throws(() => validateAssignment({ proxyId: 'unknown' }, data));
  assert.throws(() => validateAssignment(assignment, { ...data, accounts: [{ ...data.accounts[0], retailer: 'Walmart' }] }));
});
test('task assignments persist and deletion clears references; running tasks cannot be reassigned', () => {
  const engine = new TaskEngine();
  engine.add({ name: 'Example', url: 'https://target.com/p/example', price: 5, quantity: 1, accountId: 'account', proxyId: 'proxy' });
  const id = engine.items[0].id;
  const reload = new TaskEngine(engine.snapshot()); assert.equal(reload.find(id).accountId, 'account');
  engine.start(id);
  assert.throws(() => engine.assign(id, { accountId: '', proxyId: '' }), /Stop/);
  engine.stop(id); engine.clearReference('accountId', 'account'); assert.equal(engine.find(id).accountId, '');
  engine.assign(id, { accountId: '', proxyId: '' }); assert.equal(engine.find(id).proxyId, '');
});
test('Discord webhooks stay encrypted and are never returned in snapshots', async t => {
  const vault = await fixture(t);
  const alerts = 'https://discord.com/api/webhooks/123456/fake_secret_alert_token';
  await vault.saveDiscord({ alerts, enabled: true, sendDemos: true });
  assert(!JSON.stringify(vault.snapshot()).includes('fake_secret_alert_token'));
  assert(!(await fs.readFile(vault.file)).includes(Buffer.from(alerts)));
  const reload = new Vault(vault.file, vault.crypto); await reload.load();
  assert.equal(reload.snapshot().discord.alertsConfigured, true);
  assert.equal(reload.snapshot().discord.sendDemos, true);
  await reload.saveDiscord({ alerts: '', enabled: true }); assert.equal(reload.data.discord.alerts, alerts);
  await reload.saveDiscord({ clearalerts: true }); assert.equal(reload.snapshot().discord.alertsConfigured, false);
});
test('Target saved browser cookies stay encrypted and never enter UI snapshots', async t => {
  const vault = await fixture(t); await vault.save('accounts', account);
  const id = vault.snapshot().accounts[0].id;
  await vault.saveTargetSession(id, { cookies: [{ domain: '.target.com', name: 'session', value: 'secret-browser-cookie' }], origins: [] });
  assert.equal(vault.snapshot().accounts[0].hasTargetSession, true);
  assert(!JSON.stringify(vault.snapshot()).includes('secret-browser-cookie'));
  assert(!(await fs.readFile(vault.file)).includes(Buffer.from('secret-browser-cookie')));
  const reload = new Vault(vault.file, vault.crypto); await reload.load();
  assert.equal(reload.data.targetSessions[id].cookies[0].value, 'secret-browser-cookie');
  await reload.remove('accounts', id); assert.equal(reload.data.targetSessions[id], undefined);
});
