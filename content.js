// 每個 frame（含 iframe）都跑一份：負責收快捷鍵、把倍數套到自己這層的 <video>。
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

  // 有些站把播放器包成 web component，影片藏在 shadow root 裡，
  // 一般的 querySelectorAll 穿不過去，所以要自己往下走一層。
  function collectVideos(root = document, found = []) {
    root.querySelectorAll('video').forEach((v) => found.push(v));
    root.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot) collectVideos(el.shadowRoot, found);
    });
    return found;
  }

  const setRate = (video, rate) => {
    try { video.playbackRate = rate; } catch { /* 超出瀏覽器允許範圍就忽略 */ }
  };

  function applyToFrame(rate) {
    const list = collectVideos();
    list.forEach((v) => setRate(v, rate));
    // 提示交給最外層畫。影片常常在很小的嵌入 iframe 裡，
    // 畫在那一層會被播放器邊界裁掉，使用者按了鍵等於沒有回饋。
    if (list.length) chrome.runtime.sendMessage({ type: 'applied', rate }).catch(() => {});
  }

  // 影片換片或動態插入時 playbackRate 會被瀏覽器重設回 1，補套一次。
  // ponytail: 聽 play / loadstart 就夠，不需要 MutationObserver 掃 DOM。
  const reapply = async (e) => {
    // shadow DOM 裡發出的事件在 document 層會被改寫成外層的 host 元素，
    // 要用 composedPath 才拿得到真正的 <video>
    const video = e.composedPath?.()[0] || e.target;
    if (video?.tagName !== 'VIDEO') return;
    try {
      const { rate } = (await chrome.runtime.sendMessage({ type: 'get' })) || {};
      if (rate && rate !== video.playbackRate) setRate(video, rate);
    } catch { /* 擴充功能重新載入時 sendMessage 會被拒絕 */ }
  };
  document.addEventListener('play', reapply, true);
  document.addEventListener('loadstart', reapply, true);

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.repeat) return;
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

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type === 'apply') applyToFrame(msg.rate);
    else if (msg?.type === 'toast') toast(`${formatRate(msg.rate)}×`);
    else if (msg?.type === 'ping') reply({ ok: true }); // 彈窗用來確認這個頁面能不能控制
  });

  // 分頁重新整理或換網站後把先前的倍數接回來。
  // 這裡會顯示提示，否則影片莫名其妙就是快的，使用者不知道為什麼。
  chrome.runtime.sendMessage({ type: 'get' }).then(
    (res) => res?.rate && res.rate !== 1 && applyToFrame(res.rate),
    () => {}
  );
})();
