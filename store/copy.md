# Store copy (source of truth)

The Chrome Web Store listing, the promo page and the store images all take their words from this file.
Summary = `extDescription` in `_locales/*/messages.json` (≤132 chars); keep the two in sync.
Store rules: no keyword stuffing, no comparisons with other extensions, no claims the code does not back.

## en

**Tagline:** Faster video, no menus.

**Description:**

Change the playback speed of any video on the web from the keyboard.

Shortcuts (just press them on a page with a video; no need to click the video first):
• X: speed up by 0.1×
• Z: slow down by 0.1×
• R: jump to 1.8×, press again to go back to 1×

Popup:
• Click the toolbar icon and type any speed from 0.1× to 16×, or nudge it with − / +
• "Back to 1×" restores normal speed in one click

Also:
• The speed is remembered per tab, so it comes back after the next episode or a reload
• Works with players inside iframes and Shadow DOM
• Shortcuts stay out of the way while you type in a text field, and never take Ctrl / ⌘ / Alt / Shift combos
• Collects no data and connects to no server

**Screenshot captions (≤6 words each):**
1. Press X, Z or R
2. Type any speed, 0.1× to 16×
3. Works on any site with video
4. No data collected. No server.

## zh_TW

**標語：** 影片加速，不用找選單。

**說明：**

用鍵盤控制任何網頁上的影片播放速度。

快捷鍵（在有影片的頁面直接按，不需要先點影片）：
• X：加速 0.1×
• Z：減速 0.1×
• R：跳到 1.8×，再按一次回到 1×

彈窗：
• 點工具列圖示，直接輸入 0.1×–16× 之間的任何倍數，或用 − / + 微調
• 「回到 1×」一鍵恢復正常速度

其他：
• 倍數以分頁為單位記住，換集、重新整理後會自動套回
• 支援嵌在 iframe 和 Shadow DOM 裡的播放器
• 在輸入框打字時不會觸發快捷鍵，也不攔截 Ctrl / ⌘ / Alt / Shift 組合鍵
• 不收集任何資料，不連線到任何伺服器

**截圖標題：**
1. 按 X、Z、R 就能變速
2. 0.1× 到 16×，直接輸入
3. 任何有影片的網站都能用
4. 不收集資料，不連伺服器

## zh_CN

**标语：** 视频加速，不用找菜单。

**说明：**

用键盘调节任意网页视频的播放速度。

快捷键（在有视频的页面直接按，不用先点视频）：
• X：加速 0.1×
• Z：减速 0.1×
• R：跳到 1.8×，再按一次恢复 1×

弹窗：
• 点击工具栏图标，可直接输入 0.1×–16× 之间的任意倍速，或用 − / + 微调
• 「恢复 1×」一键回到正常速度

其他：
• 倍速按标签页记住，切换下一集、刷新页面后会自动恢复
• 支持嵌在 iframe 和 Shadow DOM 里的播放器
• 在输入框打字时不会触发快捷键，也不拦截 Ctrl / ⌘ / Alt / Shift 组合键
• 不收集任何数据，不连接任何服务器

**截图标题：**
1. 按 X、Z、R 即可变速
2. 0.1× 到 16×，直接输入
3. 任何有视频的网站都能用
4. 不收集数据，不连服务器

## Privacy policy (all languages, short)

Video Speed Controller stores one value per open tab: the playback speed you chose, in `chrome.storage.session`.
It is deleted when the tab closes and never leaves your browser. The extension collects no personal data,
sends nothing to any server, has no analytics and no remote code.
