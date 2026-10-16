# Orbit Desktop for Windows

A fresh Electron desktop prototype inspired by the task-management workflow of AIO tools. Independent of StellarAIO, ValorAIO, and Target. Target is the initial store placeholder based on the earlier discussion.

## Current features

Task dashboard with search, product link validation, price/quantity limits, start/stop/delete controls, local persistence, activity history, and demo Windows restock/checkout notifications. Secure renderer uses a sandbox, context isolation, a restrictive content policy, and a narrow validated IPC interface.

**Monitoring and checkout are simulated. No stock requests, account sign-ins, payment handling, or purchases are implemented.** Discord is not connected in this fresh project, and credentials from the scrapped iOS project are not included or reused. Tasks run locally while the app is open and Windows is awake. Closing it cancels active demo timers.

## Run on Windows 10/11 x64

If you have the prebuilt `Orbit Desktop-0.1.0-win.zip`, extract **all** files into a folder and launch `Orbit Desktop.exe`. No Node.js installation is needed for the prebuilt application. It is unsigned and has not been run on Windows in this Linux build environment.

For development from source:

Install current Node.js LTS, open PowerShell in this folder, then run:

```powershell
npm ci
npm start
```

Create a distributable Windows ZIP:

```powershell
npm run build:win
```

Extract the resulting ZIP in `release` and run `Orbit Desktop.exe`. Keep the full extracted folder together. The app is not code-signed; Windows may show a publisher warning. Signing requires a publisher certificate and a Windows release workflow.

## Validation

`npm test` runs dependency-free Node tests for URL/limit validation, task sequencing, cancellation, alerts-only behavior, and restart handling. Desktop rendering, notification delivery, and Windows runtime operation require testing on Windows. Build artifacts are supplied only if successfully produced; source alone is not a Windows executable.

Demo restock occurs after 3 seconds and simulated checkout 2 seconds later. The entered price is a limit, not an observed market price. Tasks are stored in Electron's user data directory (`%APPDATA%/Orbit Desktop` or the package-derived app name). No background server or hosting is required for this prototype.

The included GitHub Actions Windows build workflow runs manually or for version tags after you upload the source to your own repository. No repository has been created or workflow run by this session.
