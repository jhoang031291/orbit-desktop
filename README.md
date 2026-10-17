# Orbit Desktop for Windows

A Windows Electron task manager with account/proxy management, Discord webhooks, demo tasks for four US retailers, and a Target Playwright integration preview. Independent of Target, StellarAIO, and ValorAIO.

## Target Playwright preview (v0.4.1)

**This is not verified end-to-end automatic checkout.** The integration opens an isolated, visible Chrome or Edge browser; you sign in on Target yourself, save encrypted browser state, and inspect or monitor the exact product. Purchase review returns you to the product in that browser. You add products and complete checkout manually. Orbit does not add items, submit payment, verify orders, or report a purchase as successful.

### Set up on Windows

1. Install or update Google Chrome (the default) or Microsoft Edge. Select it in Target Live. Playwright uses its Chromium engine with the selected browser's installed stable channel; it does not download a separate browser or attach to your everyday browser profile.
Close an account browser before changing its Browser selection. Switching browsers may help identify a browser/session issue, but it is not a guaranteed fix for a Target sign-in rejection. The app still uses an isolated automation-controlled profile rather than your everyday browser profile.

2. Close the old app and run `OrbitDesktop-Setup.exe`. Launch Orbit Desktop from the Start menu. Existing records remain under the same Windows user.
3. Under Accounts, save a Target entry. Its label/username identifies your configuration; the stored password is not autofilled.
4. Create a Target task with the full product URL containing `/A-<TCIN>`, the exact variant, a price limit, an account, and a proxy or Direct.
5. Open **Target Live**, select that account and the same proxy, and click Open Target browser. Sign in and complete any verification in the actual Target browser, then return and Save session. Saving state does not independently verify sign-in or which retail account you used.
6. Select the assigned task and Check product now. Inspect the visible browser and observation result. Availability requires matching structured Product data, USD price for limit checks, and a recognized enabled shipping/add-to-cart control. Missing, conflicting, variant-mismatched, or blocked pages produce unknown/blocked rather than guessed availability.
7. Monitor every 60 seconds starts repeated checks while the app/computer stay running. Stop before changing fulfillment, signing in, editing records, or opening purchase review. A blocked page or navigation failure stops monitoring for attention in the browser.
8. Review purchase in browser requires observed availability and a current product price within your limit. It focuses the product page only. Check quantity, fulfillment, shipping, tax, payment, cart contents, and final total yourself. No order is submitted by Orbit.

Target markup changes can make page reading unavailable. Store-specific pickup and variant selection are not independently verified. No Target account login, real stock, cart, or checkout flow has been validated in development; browser tests use intercepted local fixtures. The product URL and a user-run session test are still needed for live validation. Other retailers remain demo/configuration only. The task manager's Run demo remains separate from Target Live.

### Sessions and proxies

Target cookies/local-storage state is saved only when requested, encrypted locally with Electron safeStorage / Windows DPAPI, and never returned to the renderer. Only Target-domain state is retained. Browser state cannot move to another Windows user/computer, may expire, and does not include IndexedDB or sessionStorage. The live browser has its own temporary profile; close it after use. Forget saved session closes it and deletes local saved state; it does not revoke sessions on Target's servers.

Each account uses a separate browser. Proxy credentials remain in the desktop process. HTTP/HTTPS and unauthenticated SOCKS5 may be configured; Chromium does not support authenticated SOCKS5. Close/reopen the browser to change its proxy. Task and browser proxies must match. The normal Open button and Discord do not use assigned proxies. No anti-bot evasion or verification bypass is implemented.

## Discord

In Discord channel settings, open Integrations → Webhooks → New Webhook → Copy Webhook URL. Repeat for a separate checkout channel. Save both URLs in Orbit's Discord section. They are encrypted and hidden after saving; blank edits retain them, and remove checkboxes delete them. Test buttons explicitly post TEST messages, including when automatic event notifications are disabled.

Enable Discord event notifications to send Target availability observations and purchase-review messages. Those are not order confirmations. Enable Send demo events separately to post clearly labeled simulated task messages. No webhooks from previous projects are preconfigured.

Delivery uses the ordinary desktop network, a bounded in-memory queue, a 10-second timeout, and no automatic retries. Waiting messages are skipped on app exit; in-flight messages may complete. Discord accepting a message does not guarantee a phone notification. Check Activity for accepted/failed delivery.

## Accounts and demo tasks

Save multiple accounts for Best Buy US, Amazon US, Target, Walmart US, or Other, and HTTP/HTTPS/SOCKS5 proxy configurations. Saved passwords never display again: blank edits retain them and Clear saved password removes them. Assign accounts only to their corresponding retailer's tasks. Account/proxy records are encrypted locally with no plaintext fallback. Close dependent Target browsers before editing/deleting entries. Deleting an account also deletes its saved Target browser state.

The four-retailer demo task manager has search, limits, start/stop/delete, task assignments, activity history, and native/in-app notifications. Demo tasks do not check stock, use retailer sessions/proxies, or make purchases. Existing Target tasks and legacy Best Buy account labels load compatibly.

## Development

Install current Node.js LTS, then run `npm ci` and `npm start`. Build the Windows installer and ZIP with `npm run build:win`. The app is unsigned. The ZIP must be extracted in full, with all files kept together.

`npm test` runs unit tests. `npm run test:target-browser` runs Playwright fixture and UI tests using installed Google Chrome on Windows. For Linux development with an installed Chromium, set `ORBIT_TEST_CHROMIUM` to its executable path. Tests intercept Target requests and do not sign in, post Discord messages, add cart items, or purchase anything. Windows CI runs both sets and checks that the packaged application includes its unpacked Playwright runtime. Windows credential protection and authenticated Target behavior need manual device validation.

Source and releases: https://github.com/jhoang031291/orbit-desktop
