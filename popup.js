const { formatRate } = globalThis.VSC;
const input = document.getElementById('rate');

// popup 本身沒有 sender.tab，得自己把分頁 id 帶給 background
const tabId = (async () =>
  (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id)();

async function send(message) {
  const id = await tabId;
  if (id == null) return;
  const res = await chrome.runtime.sendMessage({ ...message, tabId: id });
  if (res) input.value = formatRate(res.rate);
}

document.getElementById('faster').onclick = () => send({ type: 'step', direction: 1 });
document.getElementById('slower').onclick = () => send({ type: 'step', direction: -1 });
document.getElementById('reset').onclick = () => send({ type: 'set', rate: 1 });

function commit() {
  const value = Number(input.value);
  if (Number.isFinite(value) && input.value.trim() !== '') send({ type: 'set', rate: value });
  else send({ type: 'get' }); // 輸入不是數字就還原成目前倍數
}
input.addEventListener('change', commit);
input.addEventListener('keydown', (e) => e.key === 'Enter' && commit());
input.addEventListener('focus', () => input.select());

send({ type: 'get' });
