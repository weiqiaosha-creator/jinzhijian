/*
 * background.js — 瑾之笺·MV3 service worker【稳定空壳版 v2.0.1-stable】
 * 
 * 设计目标：零异常、零红色「错误」。
 * —— 完整业务版 background.js 复杂，容易因解析阶段的隐蔽字符（BOM/零宽字符/正则兼容）
 *    触发 Chrome/Edge 的扩展「错误」标红。空壳版只保留最必要的事件监听骨架，
 *    100% 不会出现 SyntaxError，也不会有任何运行时抛出。
 * 
 * 目前核心功能（右下角面板、拖文件、模板选择、插入编辑器、手机预览）
 * 全部由 content.js 实现，完全不依赖 background，所以空壳版不影响你日常使用。
 * 需要用到「认证号 API 推草稿/定时群发」时，再把完整业务版替换进来即可。
 */
var JZ_VERSION = '2.0.1-stable';

try {

  // ---------- 极简通知（不依赖 icon 文件，避免图片路径问题） ----------
  function jzNotify(text) {
    try {
      var opts = {
        type: 'basic',
        iconUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="24" fill="%2307c160"/><text x="50%25" y="50%25" font-family="sans-serif" font-size="64" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central" dy=".1em">瑾</text></svg>',
        title: '瑾之笺',
        message: String(text || ''),
        priority: 1
      };
      chrome.notifications.create('', opts);
    } catch (e) { /* 通知失败不抛 */ }
  }

  // ---------- chrome.alarms.onAlarm（空实现，兼容注册，不执行任何操作） ----------
  try {
    chrome.alarms.onAlarm.addListener(function (alarm) {
      try {
        if (!alarm || typeof alarm.name !== 'string') return;
        // 个人号定时骨架：检测到 jz-p- 前缀就发送通知提示用户手动（不自动操作）
        if (alarm.name.indexOf('jz-p-') === 0) {
          jzNotify('瑾之笺：检测到定时任务，请打开公众号后台手动点「插入编辑器」后发表。');
        }
      } catch (e_inner) {}
    });
  } catch (e_al) {}

  // ---------- chrome.runtime.onMessage（空实现：publish / schedule-personal 返回友好提示 / notify 直接通知） ----------
  try {
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      try {
        if (!msg || !msg.type) return;
        if (msg.type === 'notify') {
          jzNotify(msg.text || '');
          try { sendResponse({ ok: true }); } catch (_sr) {}
          return;
        }
        if (msg.type === 'publish') {
          try {
            sendResponse({
              ok: false,
              error: '当前为 stable 空壳版 background.js，暂未启用认证号 API 推草稿。' +
                '如需要 API 推送，请把完整业务版 background.js 替换到 stable 文件夹。' +
                '你现在可以用 content.js 的「插入编辑器」功能 + 手动保存草稿/发表。'
            });
          } catch (_sr) {}
          return;
        }
        if (msg.type === 'schedule-personal') {
          try {
            sendResponse({
              ok: false,
              error: '当前为 stable 空壳版 background.js，暂未启用自动定时发表。' +
                '请手动在指定时间打开公众号后台，点「插入编辑器」后发表。'
            });
          } catch (_sr) {}
          return;
        }
      } catch (e_msg) {
        try { sendResponse({ ok: false, error: '内部错误' }); } catch (_sr2) {}
      }
    });
  } catch (e_msg) {}

  // ---------- 启动成功 log（无 icon/路径/通知，纯 console） ----------
  try { console.log('[瑾之笺 v' + JZ_VERSION + '] service worker 空壳稳定版启动成功，零异常。'); } catch (_log) {}

} catch (e_topmost) {
  // ============ 最外层兜底：任何可能的初始化异常都绝对不抛出 ============
  // 连最外层 catch 里的代码也用 try/catch 保护，杜绝无限冒泡
  try { console.error('[瑾之笺] 最外层异常:', e_topmost); } catch (_a) {}
  try {
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      try { sendResponse({ ok: false, error: '扩展 service worker 异常，请重新加载扩展。' }); } catch (_b) {}
    });
  } catch (_c) {}
}<system-reminder>
Warning: the file exists but is shorter than the provided offset (2001). The file has 93 lines.
</system-reminder>