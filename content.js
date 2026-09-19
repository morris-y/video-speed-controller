// 每個 frame（含 iframe）都跑一份：負責收快捷鍵、把倍數套到自己這層的 <video>、顯示提示。
// 倍數本身由 background.js 以分頁為單位保管，這樣 top frame 按鍵也能控制 iframe 裡的影片。
(() => {
  const { formatRate } = globalThis.VSC;

  const isTyping = (el) =>
    !!el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName));

  // 用 Shadow DOM 裝提示，避免被頁面自己的 CSS 改掉樣式
  let host, toastTimer;
  function toast(text) {
    if (!host) {
      host = document.createElement('div');
      host.style.cssText = 'all:initial;position:fixed;top:16px;right:16px;z-index:2147483647';
      host.attachShadow({ mode: 'open' }).innerHTML =
        `<style>
           b{display:block;font:600 15px/1 system-ui,sans-serif;color:#fff;
             background:rgba(17,17,17,.88);padding:10px 14px;border-radius:10px;
             transition:opacity .25s}
         </style><b></b>`;
    }
    if (!host.isConnected) (document.body || document.documentElement).appendChild(host);
    const label = host.shadowRoot.querySelector('b');
    label.textContent = text;
    label.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (label.style.opacity = '0'), 900);
  }

  const setRate = (video, rate) => {
    try { video.playbackRate = rate; } catch { /* 超出瀏覽器允許範圍就忽略 */ }
  };

  function applyToFrame(rate, announce) {
    const list = document.querySelectorAll('video');
    list.forEach((v) => setRate(v, rate));
    if (announce && list.length) toast(`${formatRate(rate)}×`);
  }

  // 影片換片或動態插入時 playbackRate 會被瀏覽器重設回 1，補套一次。
  // ponytail: 聽 play / loadstart 就夠，不需要 MutationObserver 掃 DOM。
  const reapply = async (e) => {
    if (e.target?.tagName !== 'VIDEO') return;
    const { rate } = (await chrome.runtime.sendMessage({ type: 'get' })) || {};
    if (rate && rate !== e.target.playbackRate) setRate(e.target, rate);
  };
  document.addEventListener('play', reapply, true);
  document.addEventListener('loadstart', reapply, true);

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (isTyping(e.composedPath?.()[0] || e.target)) return;
      const key = e.key.toLowerCase();
      const message =
        key === 'x' ? { type: 'step', direction: 1 }
        : key === 'z' ? { type: 'step', direction: -1 }
        : key === 'r' ? { type: 'set', rate: 1 }
        : null;
      // 不呼叫 preventDefault：沒有影片的頁面按這幾個鍵應該完全無感
      if (message) chrome.runtime.sendMessage(message).catch(() => {});
    },
    true
  );

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'apply') applyToFrame(msg.rate, true);
  });

  // 分頁重新整理後把先前的倍數接回來
  chrome.runtime.sendMessage({ type: 'get' }).then(
    (res) => res?.rate && res.rate !== 1 && applyToFrame(res.rate, false),
    () => {}
  );
})();
