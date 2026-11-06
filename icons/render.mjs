// Render the SVG masters to exact-size PNGs (transparent background). Usage: node icons/render.mjs (same playwright as e2e.mjs)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const d = new URL('.', import.meta.url).pathname;
// 16 px has its own hand-tuned cut; the master is unreadable that small.
const jobs = [['icon-16.svg', 16], ['icon.svg', 32], ['icon.svg', 48], ['icon.svg', 128]].map(([f, s]) => `${d}${f}::${s}::${d}${s}.png`);
const b = await chromium.launch();
const p = await b.newPage({ deviceScaleFactor: 1 });
for (const j of jobs) {
  const [svg, size, out] = j.split('::');
  const s = +size;
  await p.setViewportSize({ width: s, height: s });
  const data = 'data:image/svg+xml;base64,' + readFileSync(svg).toString('base64');
  await p.setContent(`<style>html,body{margin:0;background:transparent}</style><img src="${data}" width="${s}" height="${s}" style="display:block">`);
  await p.locator('img').evaluate(i => i.decode());
  await p.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: s, height: s } });
  console.log(out);
}
await b.close();
