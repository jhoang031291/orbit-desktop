# Orbit Desktop for Windows

A fresh Electron desktop prototype inspired by the task-management workflow of AIO tools. Independent of StellarAIO, ValorAIO, and Target. Target remains the initial task store placeholder based on the earlier discussion.

## Accounts and proxies (v0.2.0)

- Add, edit, and delete retail accounts for Target, Walmart, Best Buy, Amazon, or Other. Multiple entries per retailer are supported.
- Save HTTP, HTTPS, or SOCKS5 proxy host/port and optional credentials. Entries are not connection-tested.
- Assign a saved Target account and proxy to a new task, or use Assign on an existing stopped task. Other retailer accounts can be organized but are not assignable to Target tasks.
- Password fields never show saved values. Leave a password blank while editing to retain it, or select Clear saved password.
- All account/proxy records are encrypted at rest using Electron safeStorage (Windows DPAPI). Passwords are not returned to the renderer or written into task history. Secure storage availability is required; there is no plaintext fallback. The vault is bound to the Windows user/computer and cannot be restored under another user.
- Deleting an entry clears task assignments. Stop dependent tasks before editing or deleting an entry.

**Assignments are configuration only. No account login, retailer session, or proxy traffic routing is implemented. The Open button launches the normal browser without the selected account or proxy.**

## Current features

Task dashboard with search, product link validation, price/quantity limits, start/stop/delete controls, local persistence, activity history, native notification tests, and visible in-app alerts. Windows notification failures are recorded in Activity. Secure renderer uses a sandbox, context isolation, a restrictive content policy, and a narrow validated IPC interface.

**Monitoring and checkout are simulated. No stock requests, account sign-ins, payment handling, or purchases are implemented.** Discord is not connected in this fresh project, and credentials from the scrapped iOS project are not included or reused. Tasks run locally while the app is open and Windows is awake. Closing it cancels active demo timers.

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

`npm test` runs dependency-free Node tests for URL/limit validation, task sequencing, cancellation, alerts-only behavior, restart handling, notification failures, encrypted vault persistence, credential redaction, password edits, and task assignments. Vault tests use an injected AES-GCM adapter; Windows DPAPI behavior still needs manual device validation. Desktop rendering, notification delivery, and Windows runtime operation require testing on Windows. Build artifacts are supplied only if successfully produced; source alone is not a Windows executable.

Demo restock occurs after 3 seconds and simulated checkout 2 seconds later. The entered price is a limit, not an observed market price. Tasks are stored in Electron's user data directory (`%APPDATA%/Orbit Desktop` or the package-derived app name). No background server or hosting is required for this prototype.

The included GitHub Actions Windows build workflow runs manually or for version tags after you upload the source to your own repository. The project is published at https://github.com/jhoang031291/orbit-desktop.
