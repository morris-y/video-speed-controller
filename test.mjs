// 倍數計算的最小檢查： node test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

eval(readFileSync(new URL('./speed.js', import.meta.url), 'utf8'));
const { nextRate, toggleRate, clampRate, formatRate, DEFAULT_RATE, MIN_RATE, MAX_RATE } = globalThis.VSC;

// 需求裡的那串操作：1 →(X) 1.8 →(Z) 1.7 →(X) 1.8
assert.equal(nextRate(1, 1), 1.8);
assert.equal(nextRate(1.8, -1), 1.7);
assert.equal(nextRate(1.7, 1), 1.8);

// 到了預設倍數之後，X 才是一次 +0.1
assert.equal(nextRate(1.8, 1), 1.9);
assert.equal(nextRate(1.9, 1), 2);
assert.equal(DEFAULT_RATE, 1.8);

// 慢速區按 X 一樣先跳回預設倍數
assert.equal(nextRate(0.5, 1), 1.8);

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

console.log('ok — 所有倍數計算檢查通過');
