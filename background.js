// 倍數以「分頁」為單位保管，快捷鍵與彈窗都經過這裡，再廣播給該分頁的所有 frame。
import './speed.js';

const { nextRate, clampRate } = globalThis.VSC;
const key = (tabId) => `rate:${tabId}`;

// 連按 X 時多個訊息會同時進來，串成佇列避免讀到同一個舊值（read-modify-write race）
let queue = Promise.resolve();

async function handle(msg, tabId) {
  const k = key(tabId);
  const current = (await chrome.storage.session.get(k))[k] ?? 1;

  const rate =
    msg.type === 'step' ? nextRate(current, msg.direction)
    : msg.type === 'set' ? clampRate(Number(msg.rate))
    : null; // 'get' 和任何沒認得的型別都只回報現值，不改動
  if (rate === null) return current;

  await chrome.storage.session.set({ [k]: rate });
  chrome.tabs.sendMessage(tabId, { type: 'apply', rate }).catch(() => {});
  return rate;
}

// 送出訊息的 frame 可能已經關掉或導頁，這時 reply 會丟 disconnected port
const safeReply = (reply, payload) => {
  try { reply(payload); } catch { /* 對方已經不在了 */ }
};

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const tabId = msg?.tabId ?? sender.tab?.id;
  if (tabId == null) {
    reply({ rate: 1 });
    return false;
  }

  // 有影片的那層回報套用成功，提示固定畫在最外層（frameId 0）
  if (msg.type === 'applied') {
    chrome.tabs
      .sendMessage(tabId, { type: 'toast', rate: msg.rate }, { frameId: 0 })
      .catch(() => {});
    return false;
  }

  queue = queue
    .then(() => handle(msg, tabId))
    .then(
      (rate) => safeReply(reply, { rate }),
      (err) => {
        console.error('[VSC]', err);
        safeReply(reply, { rate: 1 });
      }
    )
    // 佇列一旦變成 rejected，後面接上的 handle 就再也不會被呼叫，
    // 使用者的下一次按鍵會整個沒作用。這行保證它永遠是 fulfilled。
    .catch(() => {});
  return true; // 非同步回覆
});

chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove(key(tabId)));
