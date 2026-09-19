import { chromium } from 'playwright';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

// 在真的 Chromium 裡載入這個擴充功能，跑一遍使用者實際會做的操作。
// 需要 playwright： npm i -g playwright && playwright install chromium
const EXT = fileURLToPath(new URL('.', import.meta.url));

const PAGE = `<!doctype html><meta charset=utf-8><title>t</title>
<video id=v width=200 height=100></video>
<input id=box>
<iframe id=f src="/frame" width=200 height=100></iframe>`;
const FRAME = `<!doctype html><meta charset=utf-8><video id=v width=100 height=60></video>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(req.url === '/frame' ? FRAME : PAGE);
}).listen(0);
await new Promise(r => server.once('listening', r));
const base = `http://localhost:${server.address().port}`;

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vsc-'));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});

const page = await ctx.newPage();
await page.goto(base);
await page.waitForSelector('#v');

// 輪詢到目標值，不用固定 wait 猜
async function rateOf(frame = page) {
  return frame.evaluate(() => document.getElementById('v').playbackRate);
}
async function expectRate(want, label, frame = page) {
  const deadline = Date.now() + 5000;
  let got;
  do {
    got = await rateOf(frame);
    if (Math.abs(got - want) < 1e-9) { console.log(`  ok  ${label}: ${got}x`); return; }
    await new Promise(r => setTimeout(r, 60));
  } while (Date.now() < deadline);
  assert.fail(`${label}: 期望 ${want}，實際 ${got}`);
}

await expectRate(1, '初始');
await page.keyboard.press('x'); await expectRate(1.8, 'X 從 1 跳到預設倍數');
await page.keyboard.press('z'); await expectRate(1.7, 'Z 減速');
await page.keyboard.press('x'); await expectRate(1.8, 'X 回到 1.8');
await page.keyboard.press('x'); await expectRate(1.9, 'X 再 +0.1');
await page.keyboard.press('r'); await expectRate(1, 'R 重設');

// iframe 裡的影片也要跟著（top frame 按鍵）
await page.keyboard.press('x');
const inner = page.frames().find(f => f !== page.mainFrame());
await expectRate(1.8, 'iframe 內影片同步', inner);

// 游標在輸入框時不該攔截
await page.click('#box');
await page.keyboard.press('z');
await page.fill('#box', '');
await page.type('#box', 'zxr');
assert.equal(await page.inputValue('#box'), 'zxr');
await expectRate(1.8, '輸入框內按鍵不影響倍數');

// OSD 提示有出現（Shadow DOM 內）
await page.click('body');
await page.keyboard.press('x');
await expectRate(1.9, '再次加速');
const osd = await page.evaluate(() => {
  const host = [...document.body.children].find(e => e.shadowRoot?.querySelector('b'));
  return host?.shadowRoot.querySelector('b').textContent;
});
assert.equal(osd, '1.9×'); console.log(`  ok  畫面提示: ${osd}`);

// 重新整理後倍數要接回來
await page.reload();
await page.waitForSelector('#v');
await expectRate(1.9, '重新整理後沿用倍數');

// popup 的 UI 與 background 協定
const sw = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent('serviceworker');
const id = new URL(sw.url()).host;
const pop = await ctx.newPage();
await pop.goto(`chrome-extension://${id}/popup.html`);
await pop.waitForFunction(() => document.getElementById('rate').value !== '');
console.log(`  ok  彈窗顯示: ${await pop.inputValue('#rate')}x`);
await pop.fill('#rate', '4');
await pop.press('#rate', 'Enter');
await pop.waitForFunction(() => document.getElementById('rate').value === '4');
console.log('  ok  彈窗手動輸入 4x');
await pop.click('#reset');
await pop.waitForFunction(() => document.getElementById('rate').value === '1');
console.log('  ok  彈窗回到 1x');

console.log('\n全部 e2e 檢查通過');
await ctx.close(); server.close(); fs.rmSync(profile, { recursive: true, force: true });
