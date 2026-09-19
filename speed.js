// 純計算，不碰 DOM。content.js、popup.js、test.mjs 共用同一份規則。
globalThis.VSC = (() => {
  const MIN_RATE = 0.1;
  const MAX_RATE = 16; // Chrome 對 playbackRate 的實際上限，超過會丟 NotSupportedError
  const STEP = 0.1;
  const DEFAULT_RATE = 1.8;

  // 先四捨五入到小數兩位，否則 1.8 + 0.1 會變成 1.9000000000000001
  const clampRate = (rate) =>
    Number.isFinite(rate)
      ? Math.min(MAX_RATE, Math.max(MIN_RATE, Math.round(rate * 100) / 100))
      : 1;

  // direction: +1 加速（X）、-1 減速（Z）
  // 還沒到預設倍數時，按 X 一步跳到預設倍數；到了之後才一次 +0.1
  const nextRate = (current, direction, preferred = DEFAULT_RATE) =>
    direction > 0 && current < preferred
      ? clampRate(preferred)
      : clampRate(current + direction * STEP);

  // 倍數顯示：1.8 → "1.8"、2 → "2"、1.25 → "1.25"
  const formatRate = (rate) => String(Math.round(rate * 100) / 100);

  return { MIN_RATE, MAX_RATE, STEP, DEFAULT_RATE, clampRate, nextRate, formatRate };
})();
