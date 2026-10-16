const { app, BrowserWindow, ipcMain, shell, Notification } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { TaskEngine, productURL } = require('./tasks.cjs');
let window, engine, saveQueue = Promise.resolve(), quitting = false;
const page = pathToFileURL(path.join(__dirname, 'index.html')).href;

app.setAppUserModelId('com.orbitdesktop.app');
app.whenReady().then(async () => {
  const file = path.join(app.getPath('userData'), 'tasks.json');
  let snapshot = {}, loadError;
  try { snapshot = JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') loadError = 'Saved data could not be read. Existing file was preserved.'; }
  const changed = state => {
    if (window && !window.isDestroyed()) window.webContents.send('state', state);
    if (loadError) return;
    saveQueue = saveQueue.then(async () => {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file + '.tmp', JSON.stringify(state));
      await fs.rename(file + '.tmp', file);
    }).catch(() => {
      if (window && !window.isDestroyed()) window.webContents.send('save-error', 'Changes could not be saved to disk.');
    });
  };
  const notify = (title, body) => {
    if (Notification.isSupported()) new Notification({ title, body }).show();
  };
  try { engine = new TaskEngine(snapshot, changed, notify); }
  catch { loadError = 'Saved data is invalid. Existing file was preserved; this session will not save.'; engine = new TaskEngine({}, changed, notify); }
  window = new BrowserWindow({ width: 1280, height: 850, minWidth: 940, minHeight: 650,
    backgroundColor: '#101118', title: 'Orbit Desktop',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  ipcMain.handle('command', async (event, command, data) => {
    if (event.sender !== window.webContents || event.senderFrame?.url !== page) return { ok: false, error: 'Unauthorized frame.' };
    try {
      switch (command) {
        case 'snapshot': return { ok: true, state: engine.snapshot(), warning: loadError };
        case 'add': engine.add(data); break;
        case 'start': engine.start(data); break;
        case 'stop': engine.stop(data); break;
        case 'remove': engine.remove(data); break;
        case 'open': await shell.openExternal(productURL(engine.find(data).url)); break;
        default: throw new Error('Unknown command.');
      }
      return { ok: true, state: engine.snapshot() };
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
  saveQueue.finally(() => app.quit());
});
