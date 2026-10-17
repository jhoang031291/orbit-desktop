const $ = id => document.getElementById(id);
let state = { items: [], events: [], accounts: [], proxies: [], discord: {} };
let assigningRetailer = 'Target', discordDirty = false;
const discordTests = new Set();
const labels = { ready: 'Ready', paused: 'Paused', watching: 'Watching · demo', checking: 'Checkout · demo', complete: 'Complete · demo' };
function text(tag, value, className) {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}
function render() {
  $('total').textContent = state.items.length;
  $('running').textContent = state.items.filter(item => ['watching', 'checking'].includes(item.state)).length;
  $('complete').textContent = state.items.filter(item => item.state === 'complete').length;
  const items = state.items.filter(item => item.name.toLowerCase().includes($('search').value.toLowerCase()));
  $('count').textContent = items.length;
  $('task-rows').replaceChildren();
  $('empty').hidden = state.items.length > 0;
  for (const item of items) {
    const row = document.createElement('tr');
    const product = text('td', item.name); product.append(text('small', `${item.retailer.toUpperCase()} · Product task`));
    const account = state.accounts.find(entry => entry.id === item.accountId);
    const proxy = state.proxies.find(entry => entry.id === item.proxyId);
    const summary = `Account: ${account?.label || 'None'} · Proxy: ${proxy?.label || 'Direct'}`;
    const assignment = text('small', summary, 'assignment-summary'); assignment.title = summary; product.append(assignment);
    const limit = text('td', new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(item.price));
    limit.append(text('small', `Quantity ${item.quantity}`));
    const status = document.createElement('td'); status.append(text('span', labels[item.state], `status ${item.state}`));
    const actions = document.createElement('td'), group = text('div', '', 'actions');
    const active = ['watching', 'checking'].includes(item.state);
    for (const [label, command] of [[active ? 'Stop' : 'Run demo', active ? 'stop' : 'start'], ['Open', 'open'], ['Delete', 'remove']]) {
      const button = text('button', label);
      button.setAttribute('aria-label', `${label}: ${item.name}`);
      button.onclick = async () => { button.disabled = true; await execute(command, item.id); button.disabled = false; };
      group.append(button);
    }
    const assign = text('button', 'Assign');
    assign.disabled = active; assign.setAttribute('aria-label', `Assign account and proxy: ${item.name}`);
    assign.onclick = () => {
      const form = $('assignment-form'); form.elements.id.value = item.id;
      assigningRetailer = item.retailer; renderResources();
      $('assign-account').value = item.accountId || ''; $('assign-proxy').value = item.proxyId || '';
      $('assignment-dialog').showModal();
    };
    group.append(assign);
    actions.append(group);
    row.append(product, limit, text('td', item.automatic ? 'Auto · demo' : 'Alerts · demo'), status, actions);
    $('task-rows').append(row);
  }
  $('events').replaceChildren();
  if (!state.events.length) $('events').append(text('p', 'No activity yet. Create a task to get started.', 'event'));
  for (const event of state.events) {
    const entry = text('div', event.message, 'event');
    entry.append(text('time', new Date(event.date).toLocaleString()));
    $('events').append(entry);
  }
  renderResources();
}
function notice(message) { $('notice').textContent = message; $('notice').hidden = !message; }
async function execute(command, data) {
  try {
    const response = await window.orbit.command(command, data);
    if (!response.ok) throw new Error(response.error);
    if (response.state) { state = response.state; render(); }
    if (response.warning) notice(response.warning);
    else notice('');
    return true;
  } catch (error) { notice(error.message); return false; }
}
for (const button of document.querySelectorAll('[data-view]')) {
  button.onclick = () => {
    for (const section of document.querySelectorAll('.view')) section.hidden = section.id !== button.dataset.view;
    for (const nav of document.querySelectorAll('[data-view]')) nav.classList.toggle('selected', nav === button);
    $('page-label').textContent = button.textContent.trim();
  };
}
function addDialog() { $('form-error').textContent = ''; renderResources(); $('task-dialog').showModal(); }
$('add').onclick = addDialog;
$('empty-add').onclick = addDialog;
$('close-dialog').onclick = () => $('task-dialog').close();
$('search').oninput = render;
$('task-form').onsubmit = async event => {
  event.preventDefault();
  const form = new FormData(event.target);
  const input = Object.fromEntries(form);
  input.automatic = form.has('automatic');
  const submit = event.target.querySelector('[type=submit]');
  submit.disabled = true;
  if (await execute('add', input)) { $('task-dialog').close(); event.target.reset(); }
  else $('form-error').textContent = 'Task was not saved. Check the error banner.';
  submit.disabled = false;
};
window.orbit.onState(snapshot => { state = snapshot; render(); });
window.orbit.onSaveError(notice);
window.orbit.onNotification(alert => {
  $('notification-title').textContent = alert.title;
  $('notification-body').textContent = alert.body;
  $('notification-toast').hidden = false;
});
$('dismiss-notification').onclick = () => { $('notification-toast').hidden = true; };
$('test-notification').onclick = () => execute('test-notification');
$('notification-settings').onclick = () => execute('notification-settings');
execute('snapshot');

function fillSelect(id, entries, empty) {
  const select = $(id), current = select.value;
  select.replaceChildren(new Option(empty, ''));
  for (const entry of entries) select.append(new Option(entry.label, entry.id));
  select.value = entries.some(entry => entry.id === current) ? current : '';
}
function renderResources() {
  for (const kind of ['account', 'proxy']) {
    const entries = state[kind === 'account' ? 'accounts' : 'proxies'];
    $(`${kind}-count`).textContent = entries.length;
    $(`${kind === 'account' ? 'accounts' : 'proxies'}-empty`).hidden = entries.length > 0;
    const rows = $(`${kind}-rows`); rows.replaceChildren();
    for (const entry of entries) {
      const row = document.createElement('tr'), label = text('td', entry.label);
      label.append(text('small', kind === 'account' ? entry.retailer : entry.protocol.toUpperCase()));
      const endpoint = entry.host?.includes(':') ? `[${entry.host}]` : entry.host;
      const detail = text('td', kind === 'account' ? entry.username : `${endpoint}:${entry.port}`);
      const credential = text('td', entry.hasPassword ? 'Password saved' : 'No password');
      credential.append(text('small', kind === 'account' ? 'Login not connected' : 'Not tested · configuration only'));
      const actions = document.createElement('td'), group = text('div', '', 'actions');
      const edit = text('button', 'Edit'); edit.onclick = () => resourceDialog(kind, entry);
      const remove = text('button', 'Delete'); remove.onclick = async () => {
        if (!window.confirm(`Delete ${entry.label}? Any task assignments to it will be cleared.`)) return;
        remove.disabled = true; await execute(`remove-${kind}`, entry.id); remove.disabled = false;
      };
      group.append(edit, remove); actions.append(group); row.append(label, detail, credential, actions); rows.append(row);
    }
  }
  fillSelect('task-account', state.accounts.filter(entry => entry.retailer === $('task-retailer').value), 'No account');
  fillSelect('assign-account', state.accounts.filter(entry => entry.retailer === assigningRetailer), 'No account');
  for (const id of ['task-proxy', 'assign-proxy']) fillSelect(id, state.proxies, 'Direct / no proxy');
  const discord = state.discord || {};
  $('alerts-status').textContent = discord.alertsConfigured ? 'Saved · hidden' : 'Not configured';
  $('checkouts-status').textContent = discord.checkoutsConfigured ? 'Saved · hidden' : 'Not configured';
  $('test-alerts').disabled = !discord.alertsConfigured || discordTests.has('alerts');
  $('test-checkouts').disabled = !discord.checkoutsConfigured || discordTests.has('checkouts');
  if (!discordDirty) {
    $('discord-enabled').checked = Boolean(discord.enabled);
    $('discord-demos').checked = Boolean(discord.sendDemos);
  }
}
function resourceDialog(kind, entry) {
  const form = $(`${kind}-form`); form.reset();
  form.querySelector('.dialog-error')?.remove();
  for (const field of kind === 'account' ? ['id', 'label', 'retailer', 'username'] : ['id', 'label', 'protocol', 'host', 'port', 'username']) {
    if (entry) form.elements[field].value = entry[field] ?? '';
  }
  if (!entry) form.elements.id.value = '';
  $(`${kind}-title`).textContent = `${entry ? 'Edit' : 'Add'} ${kind === 'account' ? 'retail account' : 'proxy'}`;
  $(`${kind}-dialog`).showModal();
}
for (const kind of ['account', 'proxy']) {
  $(`add-${kind}`).onclick = () => resourceDialog(kind);
  $(`${kind}-form`).onsubmit = async event => {
    event.preventDefault();
    const form = new FormData(event.target), input = Object.fromEntries(form);
    input.clearPassword = form.has('clearPassword');
    const submit = event.target.querySelector('[type=submit]'); submit.disabled = true;
    if (await execute(`save-${kind}`, input)) $(`${kind}-dialog`).close();
    else dialogError(event.target);
    submit.disabled = false;
  };
  $(`${kind}-dialog`).addEventListener('close', () => $(`${kind}-form`).reset());
}
$('assignment-form').onsubmit = async event => {
  event.preventDefault();
  const submit = event.target.querySelector('[type=submit]'); submit.disabled = true;
  if (await execute('assign', Object.fromEntries(new FormData(event.target)))) $('assignment-dialog').close();
  else dialogError(event.target);
  submit.disabled = false;
};
for (const button of document.querySelectorAll('[data-close]')) button.onclick = () => $(button.dataset.close).close();
function dialogError(form) {
  form.querySelector('.dialog-error')?.remove();
  const message = text('p', $('notice').textContent, 'dialog-error'); message.setAttribute('role', 'alert');
  form.insertBefore(message, form.querySelector('[type=submit]'));
}
$('task-retailer').onchange = () => {
  const examples = { Target: 'https://www.target.com/p/…', 'Best Buy US': 'https://www.bestbuy.com/site/name/12345.p', Amazon: 'https://www.amazon.com/dp/B000000001', Walmart: 'https://www.walmart.com/ip/name/12345' };
  $('task-form').elements.url.placeholder = examples[$('task-retailer').value];
  renderResources();
};
$('discord-form').oninput = () => { discordDirty = true; };
$('discord-form').onsubmit = async event => {
  event.preventDefault();
  const form = new FormData(event.target), input = Object.fromEntries(form);
  for (const key of ['enabled', 'sendDemos', 'clearalerts', 'clearcheckouts']) input[key] = form.has(key);
  const button = event.target.querySelector('[type=submit]'); button.disabled = true;
  $('discord-error').textContent = ''; $('discord-result').textContent = '';
  if (await execute('save-discord', input)) {
    event.target.reset(); discordDirty = false; renderResources();
    $('discord-result').textContent = 'Settings saved.';
  } else $('discord-error').textContent = $('notice').textContent;
  button.disabled = false;
};
for (const kind of ['alerts', 'checkouts']) $('test-' + kind).onclick = async () => {
  discordTests.add(kind);
  const button = $('test-' + kind); button.disabled = true;
  $('discord-result').textContent = 'Sending test…'; $('discord-error').textContent = '';
  const ok = await execute('test-discord', kind);
  $('discord-result').textContent = ok ? `Discord accepted the ${kind} test message.` : '';
  if (!ok) $('discord-error').textContent = $('notice').textContent;
  discordTests.delete(kind); button.disabled = false;
};
