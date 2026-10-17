const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');
const archive = path.join(__dirname, '../release/win-unpacked/resources/app.asar');
const files = asar.listPackage(archive).map(file => file.replaceAll('\\', '/'));
for (const file of ['/src/target-browser.cjs', '/src/target-page.cjs', '/node_modules/playwright-core/package.json']) assert(files.includes(file), `Missing packaged dependency: ${file}`);
assert(fs.existsSync(archive + '.unpacked/node_modules/playwright-core/package.json'), 'Playwright runtime must be unpacked');
console.log('Target adapter and unpacked Playwright runtime verified in Windows package.');
