const { formatRate } = globalThis.VSC;
const input = document.getElementById('rate');
const buttons = [...document.querySelectorAll('button')];

// popup 本身沒有 sender.tab，得自己把分頁 id 帶給 background
const tabId = (async () =>
  (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id)();

function disable(reason) {
  input.value = '';
  input.placeholder = reason;
  input.disabled = true;
  buttons.forEach((b) => (b.disabled = true));
}

// force：使用者剛送出一個數字，就算焦點還在輸入框也要寫回被夾過的結果（例如輸入 99 會變 16）
async function send(message, force = false) {
  const id = await tabId;
  if (id == null) return;
  const res = await chrome.runtime.sendMessage({ ...message, tabId: id });
  // 否則使用者正在打字時，非同步回來的舊值會把他打到一半的數字蓋掉
  if (res && (force || document.activeElement !== input)) input.value = formatRate(res.rate);
}

document.getElementById('faster').onclick = () => send({ type: 'step', direction: 1 }, true);
document.getElementById('slower').onclick = () => send({ type: 'step', direction: -1 }, true);
document.getElementById('reset').onclick = () => send({ type: 'set', rate: 1 }, true);

function commit() {
  const value = Number(input.value);
  if (Number.isFinite(value) && input.value.trim() !== '') send({ type: 'set', rate: value }, true);
  else send({ type: 'get' }, true); // 輸入不是數字就還原成目前倍數
}
input.addEventListener('change', commit);
input.addEventListener('keydown', (e) => e.key === 'Enter' && commit());
input.addEventListener('focus', () => input.select());

(async () => {
  const id = await tabId;
  if (id == null) return disable('找不到分頁');
  try {
    // chrome:// 或擴充功能商店這類頁面注入不了 content script，
    // 不先問一聲的話，彈窗會顯示一個看起來正常、實際上套用不到任何影片的數字
    await chrome.tabs.sendMessage(id, { type: 'ping' });
  } catch {
    return disable('這個頁面不能用');
  }
  send({ type: 'get' });
})();
