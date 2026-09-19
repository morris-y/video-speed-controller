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
<div id=host></div>
<iframe id=f src="/frame" width=200 height=100></iframe>
<script>
  document.getElementById('host').attachShadow({ mode: 'open' })
    .innerHTML = '<video id=sv width=100 height=60></video>';
</script>`;
const FRAME = `<!doctype html><meta charset=utf-8><video id=v width=100 height=60></video>`;
// 最外層沒有影片、影片只在 iframe 裡：嵌入播放器最常見的長相
const EMBED_ONLY = `<!doctype html><meta charset=utf-8><title>e</title>
<iframe id=f src="/frame" width=200 height=100></iframe>`;

const routes = { '/frame': FRAME, '/embed-only': EMBED_ONLY };
const server = http
  .createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(routes[req.url] ?? PAGE);
  })
  .listen(0);
await new Promise((r) => server.once('listening', r));
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

// 一律輪詢到目標值，不用固定 wait 猜。取值失敗（frame 還在導航）就當作還沒好，繼續等。
const READ = () => document.getElementById('v')?.playbackRate ?? null;
const READ_SHADOW = () =>
  document.getElementById('host')?.shadowRoot?.getElementById('sv')?.playbackRate ?? null;

async function expectRate(want, label, { frame = page, read = READ } = {}) {
  const deadline = Date.now() + 5000;
  let got = null;
  do {
    try { got = await frame.evaluate(read); } catch { got = null; }
    if (got !== null && Math.abs(got - want) < 1e-9) {
      console.log(`  ok  ${label}: ${got}x`);
      return;
    }
    await new Promise((r) => setTimeout(r, 60));
  } while (Date.now() < deadline);
  assert.fail(`${label}: 期望 ${want}，實際 ${got}`);
}

const innerFrame = (p) => p.frames().find((f) => f.url().endsWith('/frame'));
async function waitForInnerFrame(p) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const f = innerFrame(p);
    if (f) return f;
    await new Promise((r) => setTimeout(r, 60));
  }
  assert.fail('iframe 沒有載入');
}

async function osdText(p) {
  return p.evaluate(() => {
    const host = [...document.body.children].find((e) => e.shadowRoot?.querySelector('b'));
    return host?.shadowRoot.querySelector('b').textContent ?? null;
  });
}
async function expectOsd(want, label, p = page) {
  const deadline = Date.now() + 5000;
  let got = null;
  do {
    got = await osdText(p);
    if (got === want) { console.log(`  ok  ${label}: ${got}`); return; }
    await new Promise((r) => setTimeout(r, 60));
  } while (Date.now() < deadline);
  assert.fail(`${label}: 期望 ${want}，實際 ${got}`);
}

await expectRate(1, '初始');
await page.keyboard.press('x'); await expectRate(1.8, 'X 從 1 跳到預設倍數');
await page.keyboard.press('z'); await expectRate(1.7, 'Z 減速');
await page.keyboard.press('x'); await expectRate(1.8, 'X 回到 1.8');
await page.keyboard.press('x'); await expectRate(1.9, 'X 再 +0.1');
await expectRate(1.9, 'shadow DOM 裡的影片也跟上', { read: READ_SHADOW });
await page.keyboard.press('r'); await expectRate(1, 'R 重設');

// iframe 裡的影片也要跟著（在最外層按鍵）
await page.keyboard.press('x');
await expectRate(1.8, 'iframe 內影片同步', { frame: await waitForInnerFrame(page) });
await expectOsd('1.8×', '畫面提示');

// 游標在輸入框時不該攔截
await page.click('#box');
await page.type('#box', 'zxr');
assert.equal(await page.inputValue('#box'), 'zxr');
await expectRate(1.8, '輸入框內按鍵不影響倍數');

// Shift 組合鍵留給網站自己用
await page.click('body');
await page.keyboard.press('Shift+X');
await new Promise((r) => setTimeout(r, 300));
await expectRate(1.8, 'Shift+X 不改倍數');

// 重新整理後倍數要接回來
await page.reload();
await page.waitForSelector('#v');
await expectRate(1.8, '重新整理後沿用倍數');

// 影片只在 iframe 裡時，提示要畫在最外層才看得到
const embed = await ctx.newPage();
await embed.goto(`${base}/embed-only`);
await embed.click('body');
await embed.keyboard.press('x'); // 焦點在最外層，但影片在 iframe 裡
await expectRate(1.8, '最外層按鍵控制得到 iframe 裡的影片', { frame: await waitForInnerFrame(embed) });
await expectOsd('1.8×', '最外層沒有影片時，提示仍畫在最外層', embed);
await embed.close();

// 彈窗的 UI 與 background 協定
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
const id = new URL(sw.url()).host;
const pop = await ctx.newPage();
await pop.goto(`chrome-extension://${id}/popup.html`);

// 此刻作用中的分頁是彈窗自己這頁，注入不了 content script，UI 應該整個停用，
// 而不是顯示一個看起來正常、實際上套用不到任何影片的數字
await pop.waitForFunction(() => document.getElementById('rate').disabled === true);
console.log('  ok  控制不了的頁面：彈窗停用');

// 讓網頁回到前景。實際使用時彈窗是浮層，作用中分頁就是底下那個網頁。
await page.bringToFront();
await pop.reload();
await pop.waitForFunction(() => document.getElementById('rate').value === '1.8');
console.log('  ok  彈窗顯示目前倍數: 1.8x');

const setViaPopup = async (value) => {
  await pop.evaluate((v) => {
    const el = document.getElementById('rate');
    el.value = v;
    el.dispatchEvent(new Event('change'));
  }, value);
};

await setViaPopup('4');
await pop.waitForFunction(() => document.getElementById('rate').value === '4');
await expectRate(4, '彈窗手動輸入 4x 有套到影片上');

await setViaPopup('999');
await pop.waitForFunction(() => document.getElementById('rate').value === '16');
await expectRate(16, '超出範圍的輸入被夾到 16x');

await pop.click('#slower');
await pop.waitForFunction(() => document.getElementById('rate').value === '15.9');
await expectRate(15.9, '彈窗減速鈕');

await pop.click('#reset');
await pop.waitForFunction(() => document.getElementById('rate').value === '1');
await expectRate(1, '彈窗回到 1x');

console.log('\n全部 e2e 檢查通過');
await ctx.close();
server.close();
fs.rmSync(profile, { recursive: true, force: true });
