import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
const PORT = 4187;
const OUT = process.argv[2];
function waitForPort(port, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const s = net.connect({ port, host: 'localhost' });
      s.on('connect', () => { s.destroy(); resolve(); });
      s.on('error', () => { s.destroy(); Date.now() - start > timeout ? reject(new Error('timeout')) : setTimeout(tick, 200); });
    };
    tick();
  });
}
const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
await waitForPort(PORT);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(6000);
await page.keyboard.press('Escape');
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + '/menu.png', timeout: 180000 });
await page.evaluate(() => document.getElementById('AutoExposureToggle').click());
await page.waitForTimeout(600);
await page.screenshot({ path: OUT + '/menu-manual.png', timeout: 180000 });
console.log(logs.join('\n'));
await browser.close();
preview.kill();
process.exit(0);
