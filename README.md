# Orbit Desktop for Windows

A fresh Electron desktop prototype inspired by the task-management workflow of AIO tools. Independent of StellarAIO, ValorAIO, and Target. The selected retailers are Best Buy US, Amazon US, Target, and Walmart US.

## Retailer tasks and Discord (v0.3.0)

The task form now supports US product links from Best Buy US, Amazon US, Target, and Walmart US. Choose a retailer, paste its full product link, and select an account for that same retailer. Existing Target tasks and Best Buy account entries are migrated when loaded. These are demo tasks, not live retailer integrations.

### Connect Discord

1. In your Discord server, open the alerts channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL. Repeat for a separate checkout channel. Managing webhooks requires the corresponding Discord permission.
2. In Orbit Desktop, open **Discord** in the sidebar. Paste the two URLs and save settings. Webhooks are encrypted in the local vault and never returned to the renderer. Blank edits preserve a saved value; the remove checkboxes delete it.
3. Click **Send test to Alerts** and **Send test to Checkouts**. These explicitly send TEST messages even if automatic notifications are disabled. Check the channel and Activity for results.
4. To send demo task events, enable both **Enable Discord event notifications** and **Send demo events**, then save. These messages are clearly labeled DEMO, show the retailer/product/price limit, and do not include account credentials or proxy details.

The app uses the desktop's normal network connection for Discord, not assigned task proxies. Delivery is best-effort while the app is open: a serial, in-memory queue holds at most 20 waiting/in-flight demo events, uses a 10-second request timeout, and does not retry errors or Discord rate limits automatically. Closing the app skips waiting events; a message already in flight may still be accepted. Check Activity for delivery outcomes. Discord accepting a message does not guarantee a phone notification. New installs default to notifications off and demo event sending off. No webhooks from the old project are preconfigured.

## Accounts and proxies

- Add, edit, and delete retail accounts for Target, Walmart, Best Buy, Amazon, or Other. Multiple entries per retailer are supported.
- Save HTTP, HTTPS, or SOCKS5 proxy host/port and optional credentials. Entries are not connection-tested.
- Assign an account for the selected retailer and a proxy to a new task, or use Assign on an existing stopped task. Accounts for a different retailer cannot be assigned.
- Password fields never show saved values. Leave a password blank while editing to retain it, or select Clear saved password.
- All account/proxy records are encrypted at rest using Electron safeStorage (Windows DPAPI). Passwords are not returned to the renderer or written into task history. Secure storage availability is required; there is no plaintext fallback. The vault is bound to the Windows user/computer and cannot be restored under another user.
- Deleting an entry clears task assignments. Stop dependent tasks before editing or deleting an entry.

**Assignments are configuration only. No account login, retailer session, or proxy traffic routing is implemented. The Open button launches the normal browser without the selected account or proxy.**

## Current features

Task dashboard with search, product link validation, price/quantity limits, start/stop/delete controls, local persistence, activity history, native notification tests, and visible in-app alerts. Windows notification failures are recorded in Activity. Secure renderer uses a sandbox, context isolation, a restrictive content policy, and a narrow validated IPC interface.

**Monitoring and checkout are simulated. No stock requests, account sign-ins, payment handling, or purchases are implemented.** Discord webhook delivery is configurable in this version; credentials from the scrapped iOS project are not included or reused. Tasks run locally while the app is open and Windows is awake. Closing it cancels active demo timers.

## Run on Windows 10/11 x64

If you have the prebuilt `Orbit Desktop-0.1.0-win.zip`, extract **all** files into a folder and launch `Orbit Desktop.exe`. No Node.js installation is needed for the prebuilt application. It is unsigned and has not been run on Windows in this Linux build environment.

For development from source:

The recommended download is now `OrbitDesktop-Setup.exe`; it creates the Windows shortcuts used for desktop notification registration. Close the existing app before installing and launch from the Start menu afterward. Existing task data is preserved under the same Windows user. The ZIP remains available.

Install current Node.js LTS, open PowerShell in this folder, then run:

```powershell
npm ci
npm start
```

Create a Windows installer and ZIP:

```powershell
npm run build:win
```

Extract the resulting ZIP in `release` and run `Orbit Desktop.exe`. Keep the full extracted folder together. The app is not code-signed; Windows may show a publisher warning. Signing requires a publisher certificate and a Windows release workflow.

## Validation

`npm test` runs dependency-free Node tests for URL/limit validation, task sequencing, cancellation, alerts-only behavior, restart handling, notification failures, encrypted vault persistence, credential redaction, password edits, and task assignments. Discord tests use mocked requests and send no real messages. Vault tests use an injected AES-GCM adapter; Windows DPAPI behavior still needs manual device validation. Desktop rendering, notification delivery, and Windows runtime operation require testing on Windows. Build artifacts are supplied only if successfully produced; source alone is not a Windows executable.

Demo restock occurs after 3 seconds and simulated checkout 2 seconds later. The entered price is a limit, not an observed market price. Tasks are stored in Electron's user data directory (`%APPDATA%/Orbit Desktop` or the package-derived app name). No background server or hosting is required for this prototype.

The included GitHub Actions Windows build workflow runs manually or for version tags after you upload the source to your own repository. The project is published at https://github.com/jhoang031291/orbit-desktop.
