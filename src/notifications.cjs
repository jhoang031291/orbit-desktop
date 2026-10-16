// Keep native notifications alive and report failures instead of silently dropping them.
function createNotifier({ Notification, emit, log }) {
  const active = new Set();
  function notify(title, body) {
    emit({ title, body }); // Visible in-app even when Windows suppresses desktop banners.
    if (!Notification.isSupported()) {
      log('Windows desktop notifications are unavailable. The in-app alert is still shown.');
      return;
    }
    let notification;
    const failed = () => {
      active.delete(notification);
      log('Windows notification failed. Install Orbit Desktop, launch from its Start menu shortcut, and check Windows Settings → System → Notifications.');
      emit({ title: 'Windows notification unavailable', body: 'The event is saved in Activity. Use the installer and check Windows notification settings.' });
    };
    try {
      notification = new Notification({ title, body });
      active.add(notification);
      notification.once('show', () => log(`Windows reported notification shown: ${title}.`));
      notification.once('failed', failed);
      notification.once('close', () => active.delete(notification));
      notification.once('click', () => active.delete(notification));
      notification.show();
      log(`Desktop notification requested: ${title}. Windows may suppress banners when Do Not Disturb is enabled.`);
    } catch { failed(); }
  }
  return { notify };
}
module.exports = { createNotifier };
