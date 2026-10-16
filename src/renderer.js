const $ = id => document.getElementById(id);
let state = { items: [], events: [] };
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
    const product = text('td', item.name); product.append(text('small', 'TARGET · Product task'));
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
}
function notice(message) { $('notice').textContent = message; $('notice').hidden = !message; }
async function execute(command, data) {
  try {
    const response = await window.orbit.command(command, data);
    if (!response.ok) throw new Error(response.error);
    if (response.state) { state = response.state; render(); }
    if (response.warning) notice(response.warning);
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
function addDialog() { $('form-error').textContent = ''; $('task-dialog').showModal(); }
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
execute('snapshot');
