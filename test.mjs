// 倍數計算的最小檢查： node test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

eval(readFileSync(new URL('./speed.js', import.meta.url), 'utf8'));
const { nextRate, toggleRate, clampRate, formatRate, DEFAULT_RATE, MIN_RATE, MAX_RATE } = globalThis.VSC;

// X / Z 不管在哪個倍數都是一次 ±0.1，不會跳到預設倍數
assert.equal(nextRate(1, 1), 1.1);
assert.equal(nextRate(1.1, 1), 1.2);
assert.equal(nextRate(1.7, 1), 1.8);
assert.equal(nextRate(1.8, 1), 1.9);
assert.equal(nextRate(1.9, 1), 2);
assert.equal(nextRate(0.5, 1), 0.6);
assert.equal(nextRate(1.8, -1), 1.7);
assert.equal(DEFAULT_RATE, 1.8);

// 浮點誤差不外洩：1.9000000000000001 之類的值不該出現
assert.equal(nextRate(2.9, 1), 3);
assert.equal(formatRate(nextRate(1.8, 1)), '1.9');
assert.equal(formatRate(2), '2');

// R 在 1.8 和 1 之間切換；其他倍數一律先回 1.8
assert.equal(toggleRate(1), 1.8);
assert.equal(toggleRate(1.8), 1);
assert.equal(toggleRate(2.3), 1.8);
assert.equal(toggleRate(0.5), 1.8);

// 邊界夾住
assert.equal(nextRate(MIN_RATE, -1), MIN_RATE);
assert.equal(nextRate(MAX_RATE, 1), MAX_RATE);
assert.equal(clampRate(999), MAX_RATE);
assert.equal(clampRate(0), MIN_RATE);
assert.equal(clampRate(NaN), 1);
assert.equal(clampRate(Number('abc')), 1);

// 三種語言的介面文字：任何一個語言少一個 key，那個語言的介面就會出現空白文字
const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const LOCALES = ['en', 'zh_TW', 'zh_CN'];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(read(`./_locales/${l}/messages.json`))])
);
const enKeys = Object.keys(messages.en).sort();
for (const l of LOCALES) {
  assert.deepEqual(Object.keys(messages[l]).sort(), enKeys, `${l} 的 key 和 en 不一致`);
  for (const [k, v] of Object.entries(messages[l])) {
    assert.ok(v.message?.trim(), `${l}.${k} 是空字串`);
    // 有 $X$ 的訊息每個語言都要定義同一組 placeholder，否則會印出字面的 $RATE$
    for (const [, name] of v.message.matchAll(/\$(\w+)\$/g))
      assert.ok(v.placeholders?.[name.toLowerCase()], `${l}.${k} 缺 placeholder ${name}`);
  }
}

const manifest = JSON.parse(read('./manifest.json'));
const used = new Set([
  ...read('./manifest.json').matchAll(/__MSG_(\w+)__/g),
  ...['popup.html', 'popup.js', 'content.js'].flatMap((f) => [
    ...read(`./${f}`).matchAll(/(?:getMessage|\bt)\(\s*'(\w+)'/g),
    ...read(`./${f}`).matchAll(/data-i18n(?:-[\w-]+)?="(\w+)"/g),
  ]),
].map((m) => m[1]));
assert.ok(used.size >= 10, `只找到 ${used.size} 個 key，抓 key 的規則可能失效了`);
for (const k of used) assert.ok(messages.en[k], `程式用了 ${k}，但 messages.json 沒有`);
for (const k of enKeys) assert.ok(used.has(k), `messages.json 的 ${k} 沒有任何地方用到`);
assert.equal(manifest.default_locale, 'en');
// 商店摘要上限 132 字，manifest 的 description 也適用
for (const l of LOCALES)
  assert.ok(messages[l].extDescription.message.length <= 132, `${l} 的描述超過 132 字`);

console.log(`ok — 所有倍數計算檢查通過；${LOCALES.length} 種語言 × ${enKeys.length} 個 key 齊全`);
