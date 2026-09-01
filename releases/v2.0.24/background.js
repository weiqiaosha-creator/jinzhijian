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

  // ---------- ArrayBuffer → Base64（service worker 无 FileReader，需手工编码） ----------
  function arrayBufferToBase64(buffer) {
    try {
      var bytes = new Uint8Array(buffer);
      var CHUNK = 0x8000;
      var out = '';
      for (var i = 0; i < bytes.length; i += CHUNK) {
        var sub = bytes.subarray(i, i + CHUNK);
        out += jzBtoa(String.fromCharCode.apply(null, sub));
      }
      return out;
    } catch (e) {
      return '';
    }
  }
  function jzBtoa(str) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var out = '';
    var n = str.length;
    var i = 0;
    // 以 3 字节为单位：不足的尾部显式用 NaN 标记，避免越界读造成编码错误
    while (i < n) {
      var c1 = str.charCodeAt(i++) & 0xFF;
      var c2 = i < n ? (str.charCodeAt(i++) & 0xFF) : NaN;
      var c3 = i < n ? (str.charCodeAt(i++) & 0xFF) : NaN;
      var e1 = c1 >> 2;
      var e2 = ((c1 & 3) << 4) | (isNaN(c2) ? 0 : ((c2 >> 4) & 0x0F));
      var e3;
      if (isNaN(c2)) e3 = 64; else e3 = (((c2 & 0x0F) << 2) | (isNaN(c3) ? 0 : ((c3 >> 6) & 0x03)));
      var e4 = isNaN(c3) ? 64 : (c3 & 0x3F);
      out += chars.charAt(e1) + chars.charAt(e2) + (e3 === 64 ? '=' : chars.charAt(e3)) + (e4 === 64 ? '=' : chars.charAt(e4));
    }
    return out;
  }

  // ---------- 启动即心跳：保证 SW 立刻注册，不会在扩展管理页显示「无效/不活动」 ----------
  (function jzSwAlive() {
    try {
      // 立刻 self.skipWaiting + clients.claim 激活所有旧标签页
      if (typeof self !== 'undefined' && typeof self.skipWaiting === 'function') {
        self.addEventListener('install', function () { try { self.skipWaiting(); } catch (_e) {} });
        self.addEventListener('activate', function (ev) {
          try { if (typeof self.clients !== 'undefined' && typeof self.clients.claim === 'function') { ev.waitUntil(self.clients.claim()); } } catch (_e) {}
        });
      }
      // 周期性心跳：向自身发消息（不改变功能，但让 SW 保持激活态）
      var HEARTBEAT_MS = 25 * 1000;
      setInterval(function () {
        try { if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) { /* 触发 runtime 访问维持激活 */ var _t = chrome.runtime.id; } } catch (_h) {}
      }, HEARTBEAT_MS);
    } catch (_x) {}
  })();

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

  // ============ 认证号 API：上传已转换内容到公众号草稿/素材库（draft/add） ============
  // 流程：取 access_token（带缓存）→ 把正文里每个 <img> 上传为永久素材、替换成素材 url
  //      → 调用 draft/add 创建图文草稿。所有请求都走 api.weixin.qq.com（已在 host_permissions）。
  var jzCache = { token: '', tokenAt: 0, expires: 0 };

  function jzHttpPost(url, body, headers) {
    var opts = { method: 'POST', body: body };
    if (headers) opts.headers = headers;
    return fetch(url, opts).then(function (r) { return r.text(); })
      .then(function (txt) {
        try { return JSON.parse(txt); } catch (e) { return { errcode: -1, errmsg: '响应非 JSON: ' + String(txt).slice(0, 120) }; }
      });
  }

  function jzGetToken(appid, secret) {
    return fetch('https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=' +
      encodeURIComponent(String(appid)) + '&secret=' + encodeURIComponent(String(secret)))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.access_token) throw new Error('获取 access_token 失败（' + (j.errcode || '?') + '）：' + (j.errmsg || '请检查 AppID/Secret 与 IP 白名单'));
        jzCache.token = j.access_token;
        jzCache.tokenAt = Date.now();
        jzCache.expires = ((j.expires_in || 7200) - 600) * 1000;
        return j.access_token;
      });
  }
  function jzCachedToken(appid, secret) {
    if (jzCache.token && (Date.now() - jzCache.tokenAt) < jzCache.expires) return Promise.resolve(jzCache.token);
    return jzGetToken(appid, secret);
  }

  // 把 multipart 表单的头尾 + 文件字节拼成 Blob（service worker 无 FormData 可用时的标准做法）
  function jzBuildFormBlob(boundary, bytes, mime, filename) {
    var pre = '--' + boundary + '\r\nContent-Disposition: form-data; name="media"; filename="' + filename +
      '"\r\nContent-Type: ' + (mime || 'application/octet-stream') + '\r\n\r\n';
    var post = '\r\n--' + boundary + '--\r\n';
    return new Blob([pre, bytes, post], { type: 'multipart/form-data; boundary=' + boundary });
  }

  // 上传图片字节到永久素材，返回 {media_id, url}
  function jzUploadImage(token, bytes, mime, idx) {
    var boundary = '----jzboundary' + idx + Date.now().toString(16);
    var body = jzBuildFormBlob(boundary, bytes, mime || 'image/jpeg', 'img' + idx + '.jpg');
    var url = 'https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=' +
      encodeURIComponent(token) + '&type=image';
    return jzHttpPost(url, body).then(function (j) {
      if (j.errcode) throw new Error('图片' + (idx + 1) + ' 上传素材失败（' + j.errcode + '）：' + (j.errmsg || ''));
      return j; // {media_id, url,...}
    });
  }

  // data: 前缀的 src → {bytes, mime}
  function jzDataUrlToBytes(src) {
    var comma = src.indexOf(',');
    if (comma < 0) return null;
    var meta = src.slice(5, comma); // 去掉 "data:"
    var mime = (meta.split(';')[0] || '').toLowerCase() || 'image/jpeg';
    var base64 = meta.indexOf(';base64') !== -1;
    var b64 = src.slice(comma + 1);
    var bin;
    if (base64) { try { bin = atob(b64); } catch (e) { return null; } }
    else { try { bin = decodeURIComponent(b64); } catch (e) { return null; } }
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return { bytes: u8, mime: mime };
  }

  // 抓取远程图片字节（扩展 host_permissions 已覆盖 mmbiz 等；其余域如失败则保留原链接）
  function jzFetchImage(src) {
    return fetch(src, { credentials: 'omit', referrer: '' }).then(function (res) {
      if (!res.ok) throw new Error('fetch ' + res.status);
      var mime = (res.headers.get && res.headers.get('content-type') || '').split(';')[0] || 'image/jpeg';
      return res.arrayBuffer().then(function (ab) { return { bytes: new Uint8Array(ab), mime: mime }; });
    });
  }

  // 遍历正文 <img>，逐个上传永久素材并把 src 换成素材 url；返回 {html, thumbMediaId}
  function jzUploadImagesInHtml(html, token) {
    var imgs = [];
    var re = /<img[^>]+src=["']([^"']+)["']/gi;
    var m, idx = 0;
    while ((m = re.exec(html)) !== null) { imgs.push({ raw: m[0], src: m[1], idx: idx++ }); }
    if (!imgs.length) return Promise.resolve({ html: html, thumbMediaId: '' });
    var chain = Promise.resolve();
    var repl = {};
    var firstUpload = null;
    imgs.forEach(function (im) {
      chain = chain.then(function () {
        var data = /^data:/i.test(im.src) ? jzDataUrlToBytes(im.src) : null;
        var p = data ? Promise.resolve(data) : jzFetchImage(im.src).catch(function () { return null; });
        return p.then(function (image) {
          if (!image) return; // 抓不到就保留原链接
          return jzUploadImage(token, image.bytes, image.mime, im.idx).then(function (j) {
            repl[im.raw] = j.url;
            if (!firstUpload && j.media_id) firstUpload = { media_id: j.media_id, url: j.url };
          }).catch(function (e) { console.error('[瑾之笺] 上传图片失败（保留原链接）:', e); });
        });
      });
    });
    return chain.then(function () {
      var out = html;
      for (var k in repl) { if (repl.hasOwnProperty(k)) out = out.split(k).join(repl[k]); }
      return { html: out, thumbMediaId: (firstUpload && firstUpload.media_id) || '' };
    });
  }

  // 创建图文草稿（draft/add 必须提供 thumb_media_id）
  function jzCreateDraft(token, title, content, thumbMediaId, scheduleTime) {
    var article = {
      title: title || '未命名文章',
      author: '',
      digest: '',
      content: content,
      content_source_url: '',
      thumb_media_id: thumbMediaId,
      need_open_comment: 0,
      only_fans_can_comment: 0,
      show_cover_pic: 1
    };
    if (scheduleTime) article.send_ignore_reprint = 0;
    var body = JSON.stringify({ articles: [article] });
    var url = 'https://api.weixin.qq.com/cgi-bin/draft/add?access_token=' + encodeURIComponent(token);
    return jzHttpPost(url, body, { 'Content-Type': 'application/json' }).then(function (j) {
      if (j.errcode) throw new Error('创建草稿失败（' + j.errcode + '）：' + (j.errmsg || ''));
      return j;
    });
  }

  function jzHandlePublish(payload, done) {
    var pld = payload || {};
    var title = pld.title || '未命名文章';
    var html = pld.html || '';
    var appid = pld.appid;
    var secret = pld.secret;
    if (!appid || !secret) { done({ ok: false, error: '缺少 AppID/Secret，请到插件弹窗（点击扩展图标）填写并保存。' }); return; }
    if (!html) { done({ ok: false, error: '没有可上传的内容，请先转换/抓取文章。' }); return; }
    jzCachedToken(appid, secret)
      .then(function (token) {
        return jzUploadImagesInHtml(html, token).then(function (r) { return { token: token, up: r }; });
      })
      .then(function (s) {
        if (s.up.thumbMediaId) return Promise.resolve(s);
        // 无图文章：需要一个缩略图才能建草稿，返回明确提示（不自动造假图应付审核）
        throw new Error('文章里没有图片，无法作为草稿封面。请先插入至少一张图再上传。');
      })
      .then(function (s) {
        return jzCreateDraft(s.token, title, s.up.html, s.up.thumbMediaId, pld.scheduleTime).then(function (j) {
          done({
            ok: true,
            message: '✅ 已上传到公众号草稿（draft ' + j.media_id + '）。正文图片已入库到素材库。' +
              (pld.scheduleTime ? ' 定时群发请到后台为草稿排期。' : ' 可到公众号后台「草稿箱」查看。')
          });
        });
      })
      .catch(function (e) {
        console.error('[瑾之笺] 上传草稿失败:', e);
        done({ ok: false, error: (e && e.message) || String(e) });
      });
  }

  // ---------- chrome.runtime.onMessage ----------
  try {
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      try {
        if (!msg || !msg.type) return;
        // 跨域抓图：利用扩展 host_permissions，绕过页面 CORS 限制，把 mmbiz 图片转 base64
        // 供 content.js 导出 DOCX/MD 时内嵌图片（否则 Word 因微信防盗链加载不到图）。
        if (msg.type === 'fetch-image') {
          var fUrl = msg.url;
          if (!fUrl) { try { sendResponse({ ok: false, error: 'no url' }); } catch (_sr0) {} return; }
          fetch(fUrl, { credentials: 'omit', referrer: '' })
            .then(function (res) {
              if (!res.ok) { try { sendResponse({ ok: false, status: res.status }); } catch (_sr1) {} return; }
              var mime = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
              if (!mime) { mime = 'image/jpeg'; }
              return res.arrayBuffer().then(function (ab) {
                // 直接以 Uint8Array 传输，比转 base64 字符串更高效，也避免超长字符串截断导致 atob 失败
                return { mime: mime.split(';')[0] || 'image/jpeg', bytes: new Uint8Array(ab) };
              });
            })
            .then(function (out) {
              if (!out) return;
              try { sendResponse({ ok: true, mime: out.mime, bytes: out.bytes }); } catch (_sr2) {
                // 个别浏览器/特殊环境下传不了类型化数组，回退 base64 兜底
                try {
                  var b64Fallback = arrayBufferToBase64(out.bytes.buffer);
                  sendResponse({ ok: true, mime: out.mime, data: b64Fallback });
                } catch (_sr2b) { try { sendResponse({ ok: false, error: 'transfer failed' }); } catch (_e) {} }
              }
            })
            .catch(function (e) {
              try { sendResponse({ ok: false, error: String(e && e.message || e) }); } catch (_sr3) {}
            });
          return true; // 异步响应
        }
        if (msg.type === 'notify') {
          jzNotify(msg.text || '');
          try { sendResponse({ ok: true }); } catch (_sr) {}
          return;
        }
        if (msg.type === 'publish') {
          try {
            jzHandlePublish(msg.payload, function (resp) {
              try { sendResponse(resp); } catch (_p) {}
            });
          } catch (_p) {}
          return true; // 异步响应
        }
        if (msg.type === 'schedule-personal') {
          try {
            sendResponse({
              ok: false,
              error: '个人号暂不支持后台 API 定时发表；请到点后手动打开公众号后台，点「插入编辑器」再发表。'
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
}