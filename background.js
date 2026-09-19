// 倍數以「分頁」為單位保管，快捷鍵與彈窗都經過這裡，再廣播給該分頁的所有 frame。
import './speed.js';

const { nextRate, clampRate } = globalThis.VSC;
const key = (tabId) => `rate:${tabId}`;

// 連按 X 時多個訊息會同時進來，串成佇列避免讀到同一個舊值（read-modify-write race）
let queue = Promise.resolve();

async function handle(msg, tabId) {
  const k = key(tabId);
  const current = (await chrome.storage.session.get(k))[k] ?? 1;
  if (msg.type === 'get') return current;

  const rate =
    msg.type === 'step' ? nextRate(current, msg.direction) : clampRate(Number(msg.rate));
  await chrome.storage.session.set({ [k]: rate });
  chrome.tabs.sendMessage(tabId, { type: 'apply', rate }).catch(() => {});
  return rate;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const tabId = msg?.tabId ?? sender.tab?.id;
  if (tabId == null) {
    reply({ rate: 1 });
    return false;
  }
  queue = queue.then(() => handle(msg, tabId)).then(
    (rate) => reply({ rate }),
    (err) => {
      console.error('[VSC]', err);
      reply({ rate: 1 });
    }
  );
  return true; // 非同步回覆
});

chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove(key(tabId)));
