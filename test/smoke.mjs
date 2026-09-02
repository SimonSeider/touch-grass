import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import net from 'node:net';

function waitForPort(port, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const s = net.connect({ port, host: 'localhost' });
      s.on('connect', () => { s.destroy(); resolve(); });
      s.on('error', () => {
        s.destroy();
        if (Date.now() - start > timeout) reject(new Error('timeout on port ' + port));
        else setTimeout(tick, 200);
      });
    };
    tick();
  });
}

const PORT = 4185;
try { execSync(`npm run build`, { stdio: 'pipe' }); } catch (e) { console.error('BUILD FAILED'); process.exit(1); }
try { execSync(`pkill -f "vite preview --port ${PORT}"`, { stdio: 'ignore' }); } catch { }
const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: process.cwd(), stdio: 'ignore',
});
await waitForPort(PORT);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().replace(/\x1b\[[0-9;]*m/g, '')}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

try { await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle', timeout: 20000 }); } catch (e) { console.log('goto failed:', e.message); }
await page.waitForTimeout(2500);

console.log('1) start visible:', await page.locator('#start').isVisible());
console.log('   element at center:', await page.evaluate(() => {
  const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
  return el ? (el.id || el.tagName) : 'none';
}));

const vp = page.viewportSize();
await page.mouse.click(Math.round(vp.width / 2), Math.round(vp.height / 2));
await page.waitForTimeout(1000);
console.log('2) start display after raw click:', await page.evaluate(() => document.getElementById('start').style.display));

await page.waitForTimeout(3500);
await page.mouse.move(vp.width / 2, vp.height / 2);
await page.mouse.down();
await page.mouse.move(vp.width / 2, vp.height * 0.25, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(800);

await page.screenshot({ path: '/tmp/touchgrass_after.png' });
const px = await page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = 400; c.height = 225;
  const g = c.getContext('2d');
  return null;
});

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require2 = createRequire(import.meta.url);
const { PNG } = require2('pngjs');
const png = PNG.sync.read(readFileSync('/tmp/touchgrass_after.png'));
const { width, height, data } = png;
const colors = new Set();
let sunBright = 0, greenish = 0, blueSky = 0, white = 0, cloudPx = 0;
for (let y = 0; y < height; y += 4) {
  for (let x = 0; x < width; x += 4) {
    const i = (y * width + x) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r < 30 && g < 30 && b < 30) continue;
    colors.add(`${r >> 4},${g >> 4},${b >> 4}`);
    if (r > 200 && g > 200 && b > 200) white++;
    if (g > 90 && g > r + 20 && g > b + 20) greenish++;
    if (b > r + 30 && b > g) blueSky++;
    if (y < height / 3 && r > 150 && g > 150 && b > 150 && Math.abs(r - b) < 40) cloudPx++;
  }
}
console.log('3) unique sampled colors:', colors.size);
console.log('   greenish pixels:', greenish, '| blue-sky pixels:', blueSky, '| bright/white pixels:', white, '| cloud pixels (upper region):', cloudPx);

console.log('\n---- console logs (shader-webgl-errors) ----');
const relevant = logs.filter((l) => /shader|webgl|error|redefinition|undeclared|invalid/i.test(l));
if (relevant.length === 0) console.log('(no shader/webgl errors)');
else relevant.forEach((l) => console.log(' ', l));

await browser.close();
preview.kill();
process.exit(0);
