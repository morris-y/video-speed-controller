// Render every Chrome Web Store image (4 screenshots, small promo tile, marquee) for en, zh_TW, zh_CN.
// Usage: node store/render-images.mjs   (needs playwright + its Chromium, like e2e.mjs; a global install is fine)
//
// Every screenshot holds a real capture: the unpacked extension runs in Chromium against local fixture pages
// that play a clip this script draws itself (canvas + MediaRecorder; no third-party video, no real site logos).
// Words come from store/copy.md (tagline, captions); only the privacy card lines live here.
// macOS Chromium ignores --lang, so each locale gets a temp copy of the extension that ships only that locale.
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  const req = createRequire(execSync('npm root -g').toString().trim() + '/');
  ({ chromium } = req('playwright'));
}

const STORE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(STORE);
const OUT = path.join(STORE, 'images');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'vsc-store-'));

const ORANGE = '#FF5B1F';
const INK = '#16181D';
const ICON_SVG = fs.readFileSync(path.join(ROOT, 'icons/icon.svg'), 'utf8');
const ICON_URI = 'data:image/svg+xml;base64,' + Buffer.from(ICON_SVG).toString('base64');
const LATIN = "system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif"; // single quotes: it also goes into style="" attributes

// ---------- words ----------
function readCopy() {
  const md = fs.readFileSync(path.join(STORE, 'copy.md'), 'utf8');
  const out = {};
  for (const loc of ['en', 'zh_TW', 'zh_CN']) {
    const start = md.indexOf(`\n## ${loc}\n`);
    const end = md.indexOf('\n## ', start + 4);
    const lines = md.slice(start, end).split('\n');
    const tagline = lines.map((l) => l.match(/^\*\*[^*]+[:：]\*\*\s*(.+)$/)).find(Boolean)?.[1].trim();
    const captions = lines.map((l) => l.match(/^\d\.\s+(.+)$/)?.[1].trim()).filter(Boolean);
    if (!tagline || captions.length !== 4) throw new Error(`copy.md: could not read ${loc}`);
    out[loc] = { tagline, captions };
  }
  return out;
}
const COPY = readCopy();

const LOCALES = {
  en: {
    lang: 'en', uiLang: 'en-US', font: LATIN, weight: 700,
    privacy: [
      'Remembers only the speed of each tab',
      'Forgets it when you close the tab',
      'No account, no analytics, no remote code',
      'Sends nothing to any server',
    ],
    storeTitle: 'All the data it keeps',
    storeNote: (n) => `${n} open tabs, one speed each`,
  },
  zh_TW: {
    lang: 'zh-Hant-TW', uiLang: 'zh-TW', font: '"PingFang TC", "Noto Sans TC", sans-serif', weight: 600,
    privacy: ['只記住每個分頁的倍數', '關掉分頁就忘記', '沒有帳號、沒有分析、沒有遠端程式碼', '不傳任何資料到伺服器'],
    storeTitle: '它保存的全部資料',
    storeNote: (n) => `開著 ${n} 個分頁，各存一個倍數`,
  },
  zh_CN: {
    lang: 'zh-Hans-CN', uiLang: 'zh-CN', font: '"PingFang SC", "Noto Sans SC", sans-serif', weight: 600,
    privacy: ['只记住每个标签页的倍速', '关掉标签页就清除', '没有账号、没有统计、没有远程代码', '不向任何服务器发送数据'],
    storeTitle: '它保存的全部数据',
    storeNote: (n) => `打开了 ${n} 个标签页，各存一个倍速`,
  },
};

// ---------- the clip: a flat landscape drawn on a canvas, recorded to webm ----------
async function makeClip(browser) {
  const p = await browser.newPage();
  const b64 = await p.evaluate(async () => {
    const W = 1280, H = 720, SECONDS = 10;
    const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
    document.body.append(c);
    const g = c.getContext('2d');
    const hill = (base, amp, len, speed, color, t) => {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W; x += 8) {
        const y = base + amp * Math.sin((x + t * speed) / len) + amp * 0.4 * Math.sin((x + t * speed) / (len * 0.37));
        g.lineTo(x, y);
      }
      g.lineTo(W, H);
      g.fill();
    };
    const cloud = (x, y, s) => {
      g.fillStyle = '#FFFFFF';
      g.beginPath();
      g.arc(x, y, 26 * s, 0, 7); g.arc(x + 30 * s, y - 12 * s, 32 * s, 0, 7); g.arc(x + 64 * s, y, 24 * s, 0, 7);
      g.fill();
      g.fillRect(x, y - 2 * s, 64 * s, 26 * s);
    };
    const draw = (t) => {
      g.fillStyle = '#CFE3EE'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#FF5B1F'; g.beginPath(); g.arc(930, 210 - t * 4, 74, 0, 7); g.fill();
      cloud(((140 + t * 40) % (W + 200)) - 100, 150, 1.2);
      cloud(((620 + t * 26) % (W + 200)) - 100, 110, 0.9);
      hill(430, 34, 210, 30, '#8FA3B3', t);
      hill(500, 40, 160, 70, '#4A5566', t);
      hill(590, 30, 120, 140, '#2A2F39', t);
      g.fillStyle = '#16181D'; g.fillRect(0, 660, W, 60);
    };
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 6e6 });
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const done = new Promise((r) => (rec.onstop = r));
    const t0 = performance.now();
    draw(0);
    rec.start(250);
    await new Promise((resolve) => {
      const tick = () => {
        const t = (performance.now() - t0) / 1000;
        draw(t);
        if (t < SECONDS) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    rec.stop();
    await done;
    const buf = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  });
  await p.close();
  const file = path.join(WORK, 'clip.webm');
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  return file;
}

// ---------- fixture sites ----------
// The player bar prints the <video>'s live playbackRate, so every capture shows the speed actually applied.
const PLAYER = (w, h) => `
<div class="player" style="width:${w}px">
  <video id="v" src="/clip.webm" width="${w}" height="${h}" autoplay muted playsinline></video>
  <div class="pbar"><span class="play"></span><div class="track"><i id="prog"></i></div><span id="rate">1×</span></div>
</div>
<script>
  const v = document.getElementById('v');
  const show = () => (document.getElementById('rate').textContent = Math.round(v.playbackRate * 100) / 100 + '×');
  v.addEventListener('ratechange', show); show();
  v.addEventListener('timeupdate', () => (document.getElementById('prog').style.width = Math.min(100, 12 + v.currentTime * 6) + '%'));
</script>`;
const FIX_CSS = `
*{box-sizing:border-box;margin:0}
body{font:14px/1.4 system-ui,sans-serif;background:#fff;color:#111}
.player{background:#000;border-radius:10px;overflow:hidden}
video{display:block;object-fit:cover;background:#CFE3EE}
.pbar{display:flex;align-items:center;gap:12px;height:34px;padding:0 12px;background:#16181D;color:#fff}
.play{width:0;height:0;border-left:11px solid #fff;border-top:7px solid transparent;border-bottom:7px solid transparent}
.track{flex:1;height:4px;border-radius:2px;background:#3A3F4A}.track i{display:block;height:100%;width:12%;background:#fff;border-radius:2px}
#rate{font:600 13px/1 system-ui,sans-serif;min-width:34px;text-align:right}
.sk{background:#E6E8EC;border-radius:6px;height:12px}
`;
const page = (body, extra = '') => `<!doctype html><meta charset=utf-8><title>fixture</title><style>${FIX_CSS}${extra}</style>${body}`;
const sk = (w, h = 12, mt = 10) => `<div class="sk" style="width:${w};height:${h}px;margin-top:${mt}px"></div>`;

const WATCH = page(`
<header style="height:52px;display:flex;align-items:center;gap:14px;padding:0 24px;border-bottom:1px solid #EEF0F3">
  <span style="width:26px;height:26px;border-radius:7px;background:#16181D"></span>${sk('110px', 12, 0)}
  <div style="flex:1"></div>${sk('220px', 30, 0).replace('border-radius:6px', 'border-radius:15px')}<div style="width:150px"></div>
</header>
<main style="display:flex;gap:24px;padding:20px 24px">
  <div>${PLAYER(500, 281)}${sk('360px', 16, 16)}${sk('220px')}</div>
  <aside style="flex:1">${[0, 1, 2, 3].map(() => `<div style="display:flex;gap:10px;margin-bottom:14px"><div class="sk" style="width:96px;height:54px"></div><div style="flex:1">${sk('100%', 10, 4)}${sk('60%', 10, 8)}</div></div>`).join('')}</aside>
</main>`);

const COURSE = page(`
<div style="min-height:100vh;background:#F4F5F7">
<header style="height:52px;display:flex;align-items:center;gap:14px;padding:0 24px;background:#fff;border-bottom:1px solid #E6E8EC">
  <span style="width:26px;height:26px;border-radius:50%;background:#4A5566"></span>${sk('140px', 12, 0)}
</header>
<main style="display:flex;gap:22px;padding:20px 24px">
  <div>${PLAYER(520, 292)}</div>
  <aside style="flex:1">${[0, 1, 2, 3, 4, 5].map((i) => `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;background:${i === 1 ? '#E6E8EC' : '#fff'};margin-bottom:6px"><span style="width:18px;height:18px;border-radius:50%;border:2px solid #C9CCD3"></span><div style="flex:1">${sk(['80%', '90%', '70%', '85%', '60%', '75%'][i], 10, 0)}</div></div>`).join('')}</aside>
</main></div>`);

const ARTICLE = (playerOrigin) => page(`
<header style="height:52px;display:flex;align-items:center;gap:14px;padding:0 32px;border-bottom:3px solid #16181D">
  ${sk('150px', 18, 0).replace('#E6E8EC', '#16181D')}<div style="flex:1"></div>${sk('60px', 10, 0)}${sk('60px', 10, 0)}<div style="width:90px"></div>
</header>
<article style="width:560px;margin:22px auto">
  ${sk('92%', 22, 0)}${sk('64%', 22, 10)}${sk('40%', 10, 16)}
  <iframe src="${playerOrigin}/player" width="560" height="315" style="display:block;border:0;margin-top:20px;border-radius:10px"></iframe>
  ${sk('100%', 10, 18)}${sk('96%')}${sk('88%')}
</article>`);
const EMBED = page(`<style>body{background:#000}.player{border-radius:0}</style>${PLAYER(560, 281)}`);

function serve(routes, clip) {
  const server = http.createServer((req, res) => {
    if (req.url === '/clip.webm') {
      res.writeHead(200, { 'content-type': 'video/webm' });
      return fs.createReadStream(clip).pipe(res);
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(typeof routes[req.url] === 'function' ? routes[req.url]() : routes[req.url] ?? '');
  });
  return new Promise((r) => server.listen(0, () => r(server)));
}

// ---------- captures (real extension, one locale at a time) ----------
function localeExtension(loc) {
  const dir = path.join(WORK, `ext-${loc}`);
  fs.mkdirSync(dir);
  for (const f of ['background.js', 'content.js', 'speed.js', 'popup.html', 'popup.js']) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  fs.cpSync(path.join(ROOT, 'icons'), path.join(dir, 'icons'), { recursive: true, filter: (s) => !s.endsWith('.svg') && !s.endsWith('.mjs') });
  fs.cpSync(path.join(ROOT, '_locales', loc), path.join(dir, '_locales', loc), { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  manifest.default_locale = loc;
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return dir;
}

const VIEW = { width: 800, height: 412 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitPlaying(target) {
  await target.waitForFunction(() => {
    const v = document.getElementById('v');
    return v && v.currentTime > 0.6 && v.readyState >= 2;
  }, null, { timeout: 15000 });
}
async function waitRate(target, want) {
  await target.waitForFunction((w) => Math.abs(document.getElementById('v').playbackRate - w) < 1e-9, want, { timeout: 5000 });
}
// The extension's toast fades after 0.9 s. Once the real toast shows the expected text, pin it visible for the shot.
async function holdToast(p, want) {
  await p.waitForFunction((w) => {
    const host = [...document.body.children].find((e) => e.shadowRoot?.querySelector('b'));
    const b = host?.shadowRoot.querySelector('b');
    if (!b || b.textContent !== w) return false;
    b.style.transition = 'none';
    b.style.opacity = '1';
    window.__hold = setInterval(() => (b.style.opacity = '1'), 5);
    return true;
  }, want, { timeout: 5000 });
}
async function freeze(target) {
  // pause on the current frame so the screenshot is not mid-decode
  await target.evaluate(() => document.getElementById('v').pause());
}

async function capture(loc, clip, ports) {
  const ext = localeExtension(loc);
  const profile = fs.mkdtempSync(path.join(WORK, `profile-${loc}-`));
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: VIEW,
    deviceScaleFactor: 2,
    colorScheme: 'light',
    locale: LOCALES[loc].uiLang,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--autoplay-policy=no-user-gesture-required'],
  });
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  const shots = {};
  const dir = path.join(WORK, `cap-${loc}`);
  fs.mkdirSync(dir);
  const snap = async (p, name, opts = {}) => {
    const file = path.join(dir, `${name}.png`);
    await p.screenshot({ path: file, ...opts });
    shots[name] = file;
  };

  // (1) shortcut: press R on a video page -> real toast "1.8×"
  const watch = ctx.pages()[0] ?? (await ctx.newPage());
  await watch.goto(`http://localhost:${ports.a}/watch`);
  await waitPlaying(watch);
  await watch.mouse.click(780, 400);
  await watch.keyboard.press('r');
  await waitRate(watch, 1.8);
  await holdToast(watch, '1.8×');
  await freeze(watch);
  await snap(watch, 'shortcut');
  await watch.evaluate(() => clearInterval(window.__hold));
  await watch.evaluate(() => document.getElementById('v').play());

  // (2) popup: type 2.5 + Enter, the video underneath follows
  const pop = await ctx.newPage();
  await pop.goto(`chrome-extension://${id}/popup.html`);
  await watch.bringToFront(); // like the real popup: the active tab is the web page under it
  await pop.reload();
  await pop.waitForFunction(() => document.getElementById('rate').value === '1.8');
  // popup.js copies this to <html lang>, which picks the CJK font (PingFang SC vs TC); it follows the context `locale`
  const uiLang = await pop.evaluate(() => chrome.i18n.getUILanguage());
  if (uiLang !== LOCALES[loc].uiLang) throw new Error(`popup UI language is ${uiLang}, expected ${LOCALES[loc].uiLang}`);
  await pop.locator('#rate').fill('2.5');
  await pop.locator('#rate').press('Enter');
  await waitRate(watch, 2.5);
  await pop.waitForFunction(() => document.getElementById('rate').value === '2.5');
  const box = await pop.evaluate(() => {
    const r = document.body.getBoundingClientRect();
    return { width: Math.ceil(r.width), height: Math.ceil(r.height) };
  });
  await pop.setViewportSize(box);
  await snap(pop, 'popup', { clip: { x: 0, y: 0, ...box } });
  const popupText = await pop.evaluate(() => document.body.innerText);
  await wait(1500); // let the toast fade: in Chrome the popup covers that corner anyway
  await freeze(watch);
  await snap(watch, 'popup-page');

  // (3a) a second site with its own player: Z twice -> 0.8×
  const course = await ctx.newPage();
  await course.goto(`http://localhost:${ports.c}/course`);
  await waitPlaying(course);
  await course.bringToFront();
  await course.mouse.click(780, 400);
  await course.keyboard.press('z');
  await course.keyboard.press('z');
  await waitRate(course, 0.8);
  await holdToast(course, '0.8×');
  await freeze(course);
  await snap(course, 'course');

  // (3b) a news page whose player sits in a cross-origin iframe: X three times -> 1.3×
  const article = await ctx.newPage();
  await article.goto(`http://localhost:${ports.b}/article`);
  let frame;
  for (let i = 0; i < 100 && !(frame = article.frames().find((f) => f.url().endsWith('/player'))); i++) await wait(50);
  await waitPlaying(frame);
  await article.bringToFront();
  await article.mouse.click(780, 60);
  for (let i = 0; i < 3; i++) await article.keyboard.press('x');
  await waitRate(frame, 1.3);
  await holdToast(article, '1.3×');
  await freeze(frame);
  await snap(article, 'article');

  // (4) everything the extension has stored at this point
  const stored = await sw.evaluate(() => chrome.storage.session.get(null));

  await ctx.close();
  return { shots, stored, uiLang, popupText };
}

// ---------- composition ----------
const img = (file) => 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function doc(L, w, h, body, css = '') {
  return `<!doctype html><html lang="${L.lang}"><meta charset=utf-8><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${w}px;height:${h}px;overflow:hidden;background:${INK};color:#fff;font-family:${L.font};-webkit-font-smoothing:antialiased}
.h1{position:absolute;left:80px;top:62px;font-size:54px;line-height:1.15;font-weight:${L.weight};letter-spacing:${L.lang === 'en' ? '-0.015em' : '0.01em'};white-space:nowrap}
.win{position:absolute;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 0 0 1px rgba(255,255,255,.10)}
.win.bleed{border-radius:12px 12px 0 0}
.bar{height:44px;background:#ECEDF0;display:flex;align-items:center;gap:12px;padding:0 12px 0 16px;border-bottom:1px solid #D9DBE0}
.dots{display:flex;gap:7px}.dots i{width:12px;height:12px;border-radius:50%;background:#C9CCD3}
.addr{flex:1;height:28px;border-radius:14px;background:#fff;display:flex;align-items:center;padding:0 14px;color:#4B5160;font:14px/1 ${LATIN}}
.ext{width:30px;height:30px;display:grid;place-items:center;border-radius:7px}.ext.on{background:#D5D8DE}
.ext img{width:20px;height:20px}
.shot{display:block;width:100%}
.keys{position:absolute;display:flex;gap:14px}
.key{width:68px;height:68px;border-radius:12px;background:#fff;color:${INK};display:grid;place-items:center;font:700 32px/1 ${LATIN};box-shadow:inset 0 -5px 0 #C9CCD3}
.key.hot{background:${ORANGE};color:#fff;box-shadow:inset 0 -5px 0 #C2410C}
${css}</style><body>${body}</body></html>`;
}

const win = ({ left, top, width, domain, shot, active = false, bleed = false }) => `
<div class="win ${bleed ? 'bleed' : ''}" style="left:${left}px;top:${top}px;width:${width}px">
  <div class="bar"><div class="dots"><i></i><i></i><i></i></div><div class="addr">${domain}</div><div class="ext ${active ? 'on' : ''}"><img src="${ICON_URI}"></div></div>
  <img class="shot" src="${img(shot)}">
</div>`;

const keys = (left, top, hot) =>
  `<div class="keys" style="left:${left}px;top:${top}px">${['X', 'Z', 'R'].map((k) => `<div class="key ${k === hot ? 'hot' : ''}">${k}</div>`).join('')}</div>`;

function screenshots(loc, cap) {
  const L = LOCALES[loc];
  const cap4 = COPY[loc].captions;
  const W = 1280, H = 800;
  const out = [];

  out.push(doc(L, W, H, `
    <div class="h1">${esc(cap4[0])}</div>
    ${keys(W - 80 - 3 * 68 - 2 * 14, 52, 'R')}
    ${win({ left: 80, top: 176, width: 1120, domain: 'watch.example', shot: cap.shots.shortcut, bleed: true })}`));

  const popW = 264 * 1.5;
  out.push(doc(L, W, H, `
    <div class="h1">${esc(cap4[1])}</div>
    ${win({ left: 80, top: 176, width: 1120, domain: 'watch.example', shot: cap.shots['popup-page'], active: true, bleed: true })}
    <img src="${img(cap.shots.popup)}" style="position:absolute;left:${80 + 1120 - 10 - popW}px;top:${176 + 44 + 6}px;width:${popW}px;border-radius:10px;box-shadow:0 0 0 1px #D0D3D9,0 12px 32px rgba(0,0,0,.35)">`));

  out.push(doc(L, W, H, `
    <div class="h1">${esc(cap4[2])}</div>
    ${win({ left: 80, top: 176, width: 740, domain: 'learn.example', shot: cap.shots.course })}
    ${win({ left: 460, top: 352, width: 740, domain: 'news.example', shot: cap.shots.article, bleed: true })}`));

  const entries = Object.entries(cap.stored).sort(([a], [b]) => a.localeCompare(b));
  const json = '{\n' + entries.map(([k, v], i) => `  <span class="k">"${k}"</span>: <span class="v">${v}</span>${i < entries.length - 1 ? ',' : ''}`).join('\n') + '\n}';
  out.push(doc(L, W, H, `
    <div class="h1">${esc(cap4[3])}</div>
    <div class="card">
      <div class="badge"><svg viewBox="0 0 24 24" width="34" height="34"><path d="M12 2.5 4 5.5v6c0 4.7 3.3 8.7 8 10 4.7-1.3 8-5.3 8-10v-6z" fill="#fff"/><path d="m8.2 12.2 2.6 2.6 5-5.2" fill="none" stroke="${ORANGE}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <ul>${L.privacy.map((t) => `<li><span class="tick"></span>${esc(t)}</li>`).join('')}</ul>
    </div>
    <div class="data">
      <div class="dt">${esc(L.storeTitle)}</div>
      <div class="ds">chrome.storage.session</div>
      <pre>${json}</pre>
      <div class="dn">${esc(L.storeNote(entries.length))}</div>
    </div>`, `
    .card{position:absolute;left:80px;top:184px;width:620px;height:480px;background:#fff;color:${INK};border-radius:16px;padding:44px 44px}
    .badge{width:64px;height:64px;border-radius:50%;background:${ORANGE};display:grid;place-items:center}
    ul{list-style:none;margin-top:34px}
    li{display:flex;align-items:center;gap:16px;font-size:27px;line-height:1.3;font-weight:500;padding:17px 0;border-top:1px solid #ECEDF0}
    li:first-child{border-top:0}
    .tick{flex:none;width:12px;height:12px;border-radius:50%;background:${ORANGE}}
    .data{position:absolute;left:732px;top:184px;width:468px;height:480px;background:#1F2228;border:1px solid #2E323A;border-radius:16px;padding:44px 40px}
    .dt{font-size:27px;font-weight:600}
    .ds{margin-top:10px;font:16px/1 ui-monospace,Menlo,monospace;color:#9AA0AB}
    pre{margin-top:34px;font:22px/1.6 ui-monospace,Menlo,monospace;color:#fff}
    .k{color:#C9CCD3}.v{color:${ORANGE};font-weight:700}
    .dn{position:absolute;left:40px;right:40px;bottom:40px;font-size:19px;color:#9AA0AB}`));
  return out;
}

function promoSmall(loc) {
  const L = LOCALES[loc];
  return doc(L, 440, 280, `
    <img src="${ICON_URI}" style="position:absolute;left:30px;top:34px;width:84px;height:84px">
    <div style="position:absolute;left:40px;top:136px;font:700 31px/1.1 ${LATIN};letter-spacing:-0.01em;white-space:nowrap">Pacekey</div>
    <div style="position:absolute;left:40px;top:186px;font-size:23px;line-height:1.3;font-weight:${L.weight};color:${ORANGE};white-space:nowrap">${esc(COPY[loc].tagline)}</div>`);
}

function marquee(loc, cap) {
  const L = LOCALES[loc];
  const popW = 264 * 1.45;
  return doc(L, 1400, 560, `
    <img src="${ICON_URI}" style="position:absolute;left:78px;top:92px;width:132px;height:132px">
    <div style="position:absolute;left:96px;top:250px;font:700 62px/1.1 ${LATIN};letter-spacing:-0.02em;white-space:nowrap">Pacekey</div>
    <div style="position:absolute;left:96px;top:340px;font-size:38px;line-height:1.3;font-weight:${L.weight};color:${ORANGE};white-space:nowrap">${esc(COPY[loc].tagline)}</div>
    <img src="${img(cap.shots.popup)}" style="position:absolute;left:${1400 - 110 - popW}px;top:116px;width:${popW}px;border-radius:12px">
    ${keys(1400 - 110 - popW + (popW - (3 * 68 + 2 * 14)) / 2, 378, 'R')}`);
}

// ---------- main ----------
const composer = await chromium.launch({ channel: 'chromium' });
console.log('recording clip (10 s)...');
const clip = await makeClip(composer);

const servers = await Promise.all([
  serve({ '/watch': WATCH }, clip),
  serve({}, clip), // b: article (filled in below, needs the player origin)
  serve({ '/course': COURSE }, clip),
  serve({ '/player': EMBED }, clip),
]);
const [a, b, c, d] = servers.map((s) => s.address().port);
// the article and its player are on different origins: localhost:b embeds 127.0.0.1:d
servers[1].removeAllListeners('request');
servers[1].on('request', (req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(req.url === '/article' ? ARTICLE(`http://127.0.0.1:${d}`) : '');
});

const report = [];
for (const loc of Object.keys(LOCALES)) {
  console.log(`capturing ${loc}...`);
  const cap = await capture(loc, clip, { a, b, c });
  console.log(`  popup: chrome.i18n.getUILanguage()=${cap.uiLang}; text: ${JSON.stringify(cap.popupText)}`);
  const dir = path.join(OUT, loc);
  fs.mkdirSync(dir, { recursive: true });
  const jobs = [
    ...screenshots(loc, cap).map((html, i) => [`screenshot-${i + 1}.png`, html, 1280, 800]),
    ['promo-small-440x280.png', promoSmall(loc), 440, 280],
    ['marquee-1400x560.png', marquee(loc, cap), 1400, 560],
  ];
  for (const [name, html, width, height] of jobs) {
    const p = await composer.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await p.setContent(html, { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    const file = path.join(dir, name);
    await p.screenshot({ path: file, type: 'png' });
    await p.close();
    report.push(file);
  }
}

await composer.close();
servers.forEach((s) => s.close());
fs.rmSync(WORK, { recursive: true, force: true });
console.log(report.map((f) => path.relative(ROOT, f)).join('\n'));
