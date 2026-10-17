const { app, BrowserWindow, ipcMain, shell, Notification, safeStorage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { TaskEngine, productURL, taskInput } = require('./tasks.cjs');
const { sendDiscord } = require('./discord.cjs');
const { TargetBrowser } = require('./target-browser.cjs');
const { createNotifier } = require('./notifications.cjs');
const { Vault, validateAssignment } = require('./vault.cjs');
let window, engine, credentialVault, targetRuntime, saveQueue = Promise.resolve(), discordQueue = Promise.resolve(), discordPending = 0, quitting = false;
const page = pathToFileURL(path.join(__dirname, 'index.html')).href;

app.setAppUserModelId('com.orbitdesktop.app');
app.whenReady().then(async () => {
  const file = path.join(app.getPath('userData'), 'tasks.json');
  const vault = new Vault(path.join(app.getPath('userData'), 'credentials.enc'), safeStorage);
  credentialVault = vault;
  let vaultWarning;
  try { await vault.load(); } catch (error) { vaultWarning = error.message; }
  const publicState = (tasks = engine.snapshot()) => ({ ...tasks, ...vault.snapshot(), targetBrowsers: targetRuntime?.snapshot() || [] });
  let snapshot = {}, loadError;
  try { snapshot = JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') loadError = 'Saved data could not be read. Existing file was preserved.'; }
  const changed = state => {
    if (window && !window.isDestroyed()) window.webContents.send('state', publicState(state));
    if (loadError) return;
    saveQueue = saveQueue.then(async () => {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file + '.tmp', JSON.stringify(state));
      await fs.rename(file + '.tmp', file);
    }).catch(() => {
      if (window && !window.isDestroyed()) window.webContents.send('save-error', 'Changes could not be saved to disk.');
    });
  };
  const { notify } = createNotifier({
    Notification,
    emit: alert => { if (window && !window.isDestroyed()) window.webContents.send('notification', alert); },
    log: message => engine?.log(message)
  });
  const queueDiscord = event => {
    if (quitting || !vault.data.discord.enabled || !event.live && !vault.data.discord.sendDemos) return;
    if (discordPending >= 20) { engine.log('Discord queue is full. Demo message skipped.'); return; }
    discordPending++;
    discordQueue = discordQueue.then(async () => {
      if (quitting || !vault.data.discord.enabled || !event.live && !vault.data.discord.sendDemos) return;
      try { await sendDiscord(vault.data.discord, event); engine.log(`Discord ${event.kind}: ${event.live ? 'Target' : 'demo'} message accepted.`); }
      catch (error) { engine.log(`Discord ${event.kind}: ${error.message}`); }
    }).finally(() => { discordPending--; });
  };
  try { engine = new TaskEngine(snapshot, changed, notify, undefined, queueDiscord); }
  catch { loadError = 'Saved data is invalid. Existing file was preserved; this session will not save.'; engine = new TaskEngine({}, changed, notify, undefined, queueDiscord); }
  targetRuntime = new TargetBrowser({ vault, update: () => { if (window && !window.isDestroyed()) window.webContents.send('state', publicState()); },
    log: message => engine.log(message), onEvent: event => {
      notify(event.kind === 'alerts' ? 'Target availability observed' : 'Target checkout review', `${event.item.name} — ${event.kind === 'alerts' ? 'Check fulfillment in the Target browser.' : 'No order submitted by Orbit.'}`);
      queueDiscord(event);
    }
  });
  if (!vaultWarning) {
    const saved = vault.snapshot();
    for (const item of engine.items) {
      if (!saved.accounts.some(entry => entry.id === item.accountId && entry.retailer === item.retailer)) item.accountId = '';
      if (!saved.proxies.some(entry => entry.id === item.proxyId)) item.proxyId = '';
    }
  }
  window = new BrowserWindow({ width: 1280, height: 850, minWidth: 940, minHeight: 650,
    backgroundColor: '#101118', title: 'Orbit Desktop',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  ipcMain.handle('command', async (event, command, data) => {
    if (event.sender !== window.webContents || event.senderFrame?.url !== page) return { ok: false, error: 'Unauthorized frame.' };
    try {
      if (['assign', 'remove'].includes(command)) {
        const id = command === 'assign' ? data.id : data;
        if ([...targetRuntime.sessions.values()].some(s => s.taskId === id && (s.timer || s.busy))) throw new Error('Stop the Target live monitor before changing this task.');
      }
      switch (command) {
        case 'target-open': await targetRuntime.open(data.accountId, data.proxyId || '', data.channel || 'chrome'); break;
        case 'target-save-session': await targetRuntime.saveSession(data); break;
        case 'target-close': await targetRuntime.close(data); break;
        case 'target-clear-session': await targetRuntime.close(data); await vault.saveTargetSession(data, null); break;
        case 'target-check': await targetRuntime.check(data.accountId, engine.find(data.taskId)); break;
        case 'target-monitor': targetRuntime.start(data.accountId, engine.find(data.taskId)); break;
        case 'target-stop': await targetRuntime.stop(data); break;
        case 'target-checkout': await targetRuntime.checkout(data.accountId, engine.find(data.taskId)); break;
        case 'snapshot': return { ok: true, state: publicState(), warning: [loadError, vaultWarning].filter(Boolean).join(' ') };
        case 'add': {
          const item = taskInput(data);
          engine.add({ ...item, ...validateAssignment(item, vault.snapshot(), item.retailer) }); break;
        }
        case 'assign': engine.assign(data.id, validateAssignment(data, vault.snapshot(), engine.find(data.id).retailer)); break;
        case 'save-discord': await vault.saveDiscord(data); engine.log('Saved Discord notification settings.'); break;
        case 'test-discord':
          await sendDiscord(vault.data.discord, { kind: data, test: true });
          engine.log(`Discord ${data}: test message accepted.`); break;
        case 'save-account':
        case 'save-proxy': {
          const kind = command === 'save-account' ? 'accounts' : 'proxies';
          if (kind === 'accounts' && targetRuntime.sessions.has(data?.id) || kind === 'proxies' && [...targetRuntime.sessions.values()].some(s => s.proxyId === data?.id)) throw new Error('Close Target browsers using this entry before editing it.');
          if (data?.id && engine.items.some(item => engine.jobs.has(item.id) && item[kind === 'accounts' ? 'accountId' : 'proxyId'] === data.id)) throw new Error('Stop tasks using this entry before editing it.');
          if (kind === 'accounts' && engine.items.some(item => item.accountId === data?.id && item.retailer !== data.retailer)) throw new Error('Unassign this account from its tasks before changing its retailer.');
          await vault.save(kind, data);
          engine.log(kind === 'accounts' ? 'Saved retail account configuration. No retailer login was performed.' : 'Saved proxy configuration. Connection has not been tested.');
          break;
        }
        case 'remove-account':
        case 'remove-proxy': {
          const kind = command === 'remove-account' ? 'accounts' : 'proxies';
          if (kind === 'accounts' && targetRuntime.sessions.has(data) || kind === 'proxies' && [...targetRuntime.sessions.values()].some(s => s.proxyId === data)) throw new Error('Close Target browsers using this entry before deleting it.');
          const key = kind === 'accounts' ? 'accountId' : 'proxyId';
          if (engine.items.some(item => engine.jobs.has(item.id) && item[key] === data)) throw new Error('Stop tasks using this entry before deleting it.');
          await vault.remove(kind, data);
          engine.clearReference(key, data);
          engine.log(kind === 'accounts' ? 'Removed retail account configuration.' : 'Removed proxy configuration.');
          break;
        }
        case 'start': engine.start(data); break;
        case 'stop': engine.stop(data); break;
        case 'remove': engine.remove(data); break;
        case 'open': await shell.openExternal(productURL(engine.find(data).url)); break;
        case 'test-notification': notify('Orbit Desktop test', 'This is a test alert. No stock was checked and no order was placed.'); break;
        case 'notification-settings': await shell.openExternal('ms-settings:notifications'); break;
        default: throw new Error('Unknown command.');
      }
      return { ok: true, state: publicState(), warning: [loadError, vaultWarning].filter(Boolean).join(' ') };
    } catch (error) { return { ok: false, error: error.message }; }
  });
  await window.loadFile(path.join(__dirname, 'index.html'));
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  engine?.close();
  Promise.resolve(targetRuntime?.closeAll()).then(() => discordQueue).then(() => credentialVault?.pending).then(() => saveQueue).finally(() => app.quit());
});
