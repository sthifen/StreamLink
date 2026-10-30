import { _electron as electron } from 'playwright-core';
import path from 'path';
import { mkdirSync } from 'fs';

const APP_DIR = '/home/steven/Escritorio/beta2-redesign';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/electron');

const app = await electron.launch({
  executablePath: electronBin,
  args: ['--no-sandbox', APP_DIR],
  env: { ...process.env, NODE_ENV: 'development', DISPLAY: process.env.DISPLAY || ':99' },
  timeout: 30000,
});

await new Promise(r => setTimeout(r, 10000));

const page = app.windows().find(w => w.url().startsWith('http')) ?? await app.firstWindow();
console.log('windows:', app.windows().map(w => w.url()));

mkdirSync('/tmp/shots', { recursive: true });

// Screenshot immediately (should show Apps tab — it's the default tab now)
await page.screenshot({ path: '/tmp/shots/beta2-apps-01.png' });
console.log('shot 1 (initial):', '/tmp/shots/beta2-apps-01.png');

// Click "Recargar" if apps are empty, then wait for them to load
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const btn = btns.find(b => b.textContent.includes('Recargar'));
  if (btn) { btn.click(); console.log('clicked Recargar'); }
});
await new Promise(r => setTimeout(r, 18000));

await page.screenshot({ path: '/tmp/shots/beta2-apps-02.png' });
console.log('shot 2 (after load):', '/tmp/shots/beta2-apps-02.png');

await app.close();
