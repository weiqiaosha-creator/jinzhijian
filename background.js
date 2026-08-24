/*
 * background.js — 瑾之笺·MV3 service worker（完整版）
 * 
 * 设计原则：零 importScripts 依赖、纯 ES5 语法、全 try/catch 防护
 * —— 任何初始化阶段异常都 catch 住不抛出，确保 Service Worker 不会显示"无效"。
 * 
 * 个人使用优先，代码重复（与 wechat-common.js 重复）换来了 100% 的加载稳定性。
 */
'use strict';

/* ===================== 全局防护：任何初始化异常都不抛 ===================== */
try {

/* ========== 共享函数（从 wechat-common.js 内联） ========== */

function extractImageSrcs(html) {
  var out = [];
  var seen = {};
  var re = /<img\b[^>]*\bsrc\s*=\s*["']?([^"' >]+)/gi;
  var m;
  while ((m = re.exec(html)) !== null) {
    var s = m[1];
    if (!seen[s]) { seen[s] = true; out.push(s); }
  }
  return out;
}

function isGifSrc(src) {
  return /\.gif(\?|$)/i.test(src) || /^data:image\/gif/i.test(src);
}

function firstNonGifImage(html) {
  var srcs = extractImageSrcs(html);
  for (var i = 0; i < srcs.length; i++) {
    if (!isGifSrc(srcs[i])) return srcs[i];
  }
  return null;
}

function firstAnyImage(html) {
  var srcs = extractImageSrcs(html);
  return srcs.length ? srcs[0] : null;
}

function detectMimeFromBuf(buf) {
  if (!buf || buf.length < 4) return 'image/png';
  var b0 = buf[0] | 0;
  var b1 = buf[1] | 0;
  var b2 = buf[2] | 0;
  var b3 = buf[3] | 0;
  if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4e && b3 === 0x47) return 'image/png';
  if (b0 === 0xFF && b1 === 0xD8 && b2 === 0xFF) return 'image/jpeg';
  if (b0 === 0x47 && b1 === 0x49 && b2 === 0x46) return 'image/gif';
  if (b0 === 0x52 && b1 === 0x49 && b2 === 0x46 && b3 === 0x46 && buf.length >= 12) {
    var s = '';
    for (var k = 8; k < 12; k++) s += String.fromCharCode(buf[k]);
    if (s === 'WEBP') return 'image/webp';
  }
  if (b0 === 0x3C && b1 === 0x73 && b2 === 0x76 && b3 === 0x67) return 'image/svg+xml';
  return 'image/png';
}

function stripHtmlTags(str) {
  return String(str == null ? '' : str)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDigest(html, max) {
  var maxLen = max || 120;
  var text = stripHtmlTags(html);
  if (text.length > maxLen) text = text.slice(0, maxLen);
  return text;
}

function isApiDenied(code) {
  // 常见无权限 errcode
  if (code === 48001 || code === 40001 || code === 61000 || code === 61003 || code === 61004) return true;
  return false;
}

function apiFriendly(errjson, stage) {
  var code = errjson && errjson.errcode;
  if (isApiDenied(code)) {
    return '该账号无「' + stage + '」接口权限（多为个人订阅号或未微信认证）。' +
      '请改用插件的「个人号」定时模式，或完成微信认证后再用 API。';
  }
  return stage + '失败: ' + ((errjson && errjson.errmsg) || JSON.stringify(errjson));
}

function retry(fn, opts) {
  var maxAttempts = (opts && opts.maxAttempts) || 3;
  var baseDelay = (opts && opts.baseDelay) || 1000;
  var attempt = 0;
  function run() {
    attempt++;
    return fn().catch(function (err) {
      if (attempt >= maxAttempts) throw err;
      var delay = baseDelay * Math.pow(2, attempt - 1);
      return new Promise(function (res) { setTimeout(res, delay); }).then(run);
    });
  }
  return run();
}

function filenameFromMime(mime) {
  if (mime === 'image/gif') return 'img.gif';
  if (mime === 'image/png') return 'img.png';
  if (mime === 'image/jpeg') return 'img.jpg';
  return 'img.png';
}

/* ========== 业务逻辑 ========== */

var tokenCache = { token: '', expire: 0 };

function getToken(appid, secret) {
  var now = Date.now();
  if (tokenCache.token && tokenCache.expire > now + 60000) return Promise.resolve(tokenCache.token);
  var url = 'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=' +
    encodeURIComponent(appid) + '&secret=' + encodeURIComponent(secret);
  return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
    if (j.access_token) {
      tokenCache = { token: j.access_token, expire: now + (j.expires_in || 7200) * 1000 };
      return j.access_token;
    }
    if (j.errcode === 40125) throw new Error('AppSecret 无效或被停用，请到公众号后台重置。');
    if (j.errcode === 40013) throw new Error('AppID 无效，请核对。');
    throw new Error('获取 access_token 失败: ' + (j.errmsg || JSON.stringify(j)));
  });
}

function dataUriToBuf(uri) {
  var m = String(uri || '').match(/^data:([^;]+);base64,(.*)$/);
  if (!m) return null;
  var raw = m[2];
  var binary = atob(raw);
  var out = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return { mime: m[1], buf: out };
}

function fetchImage(src) {
  if (String(src || '').indexOf('data:') === 0) return Promise.resolve(dataUriToBuf(src));
  if (String(src || '').indexOf('http') !== 0) return Promise.resolve(null);
  try {
    return fetch(src).then(function (r) {
      if (!r.ok) return null;
      return r.arrayBuffer().then(function (ab) {
        var buf = new Uint8Array(ab);
        var mime = detectMimeFromBuf(buf);
        return { mime: mime, buf: buf };
      });
    }).catch(function () { return null; });
  } catch (e) {
    return Promise.resolve(null);
  }
}

function uploadAllImages(token, html) {
  var MAX_IMG = 30;
  var srcs = extractImageSrcs(html).slice(0, MAX_IMG);
  var outHtml = html;
  var i = 0;
  function next() {
    if (i >= srcs.length) return Promise.resolve(outHtml);
    var src = srcs[i++];
    return fetchImage(src).then(function (img) {
      if (!img) return next();
      var doUpload = retry(function () {
        var fd = new FormData();
        var blob;
        try { blob = new Blob([img.buf], { type: img.mime }); }
        catch (e) { blob = new Blob([img.buf.buffer]); }
        fd.append('media', blob, filenameFromMime(img.mime));
        var url2 = 'https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=' + token;
        return fetch(url2, { method: 'POST', body: fd }).then(function (r2) { return r2.json(); });
      }, { maxAttempts: 2, baseDelay: 500 });
      return doUpload.then(function (r3) {
        if (r3 && r3.url) outHtml = String(outHtml).split(src).join(r3.url);
        return next();
      }).catch(function () { return next(); });
    });
  }
  return next();
}

function publish(p) {
  var _token = null;
  var _html = null;
  var _coverSrc = null;
  var _thumbMediaId = null;
  var _mediaId = null;
  return getToken(p.appid, p.secret).then(function (t) {
    _token = t;
    return uploadAllImages(t, p.html);
  }).then(function (processedHtml) {
    _html = processedHtml;
    _coverSrc = firstNonGifImage(_html);
    if (!_coverSrc) throw new Error('缺少封面图（文中需至少含一张非 GIF 图片）。');
    return fetchImage(_coverSrc);
  }).then(function (coverImg) {
    if (!coverImg) throw new Error('封面图下载失败，无法建草稿。');
    var coverMime = coverImg.mime === 'image/gif' ? 'image/png' : coverImg.mime;
    var fd = new FormData();
    try { fd.append('media', new Blob([coverImg.buf], { type: coverMime }), filenameFromMime(coverMime)); }
    catch (e) { fd.append('media', new Blob([coverImg.buf.buffer]), filenameFromMime(coverMime)); }
    var url3 = 'https://api.weixin.qq.com/cgi-bin/material/add_material?type=image&access_token=' + _token;
    return fetch(url3, { method: 'POST', body: fd }).then(function (r) { return r.json(); });
  }).then(function (matRes) {
    _thumbMediaId = matRes && matRes.media_id || '';
    if (!_thumbMediaId) throw new Error('封面上传失败: ' + JSON.stringify(matRes || {}));
    var digest = p.digest || extractDigest(_html, 120);
    var body = JSON.stringify({ articles: [{ title: p.title, author: p.author || '', digest: digest, content: _html, thumb_media_id: _thumbMediaId }] });
    var doDraft = retry(function () {
      var url4 = 'https://api.weixin.qq.com/cgi-bin/draft/add?access_token=' + _token;
      return fetch(url4, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body }).then(function (r) { return r.json(); });
    }, { maxAttempts: 3, baseDelay: 1000 });
    return doDraft();
  }).then(function (draftRes) {
    if (draftRes && draftRes.errcode) throw new Error(apiFriendly(draftRes, '建草稿'));
    if (!draftRes || !draftRes.media_id) throw new Error('建草稿失败: ' + JSON.stringify(draftRes));
    _mediaId = draftRes.media_id;
    if (!p.scheduleTime) {
      return { ok: true, message: '已推送到草稿箱，请到公众号后台审核发布。media_id=' + _mediaId };
    }
    var now = Math.floor(Date.now() / 1000);
    if (p.scheduleTime <= now) throw new Error('定时时间需晚于当前时间');
    var sendBody = JSON.stringify({ filter: { is_to_all: true }, mpnews: { media_id: _mediaId }, send_time: p.scheduleTime });
    var doSend = retry(function () {
      var url5 = 'https://api.weixin.qq.com/cgi-bin/message/mass/sendall?access_token=' + _token;
      return fetch(url5, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: sendBody }).then(function (r) { return r.json(); });
    }, { maxAttempts: 3, baseDelay: 1000 });
    return doSend.then(function (sendRes) {
      if (sendRes && sendRes.errcode) throw new Error(apiFriendly(sendRes, '群发'));
      var msgId = (sendRes && sendRes.msg_id) || '';
      var now2 = Math.floor(Date.now() / 1000);
      return {
        ok: true,
        message: (p.scheduleTime > now2 ? '已设置定时群发（' + new Date(p.scheduleTime * 1000).toLocaleString() + '）。' : '已立即群发。') + ' msg_id=' + msgId
      };
    });
  });
}

function schedulePersonal(task) {
  return new Promise(function (resolve) {
    var id = 'jz-p-' + task.ts + '-' + Math.floor(Math.random() * 1000000);
    chrome.storage.local.get(['jz_tasks'], function (d) {
      var tasks = d.jz_tasks || [];
      var merged = {};
      merged.id = id;
      var ks = Object.keys(task);
      for (var k = 0; k < ks.length; k++) merged[ks[k]] = task[ks[k]];
      tasks.push(merged);
      chrome.storage.local.set({ jz_tasks: tasks }, function () {
        try { chrome.alarms.create(id, { when: task.ts * 1000 }); }
        catch (e_alm) { console.warn('[瑾之笺] alarms.create 失败:', e_alm); }
        resolve({ ok: true, message: '已登记个人号定时（' + new Date(task.ts * 1000).toLocaleString() + '），到点将自动打开后台发表（需保持登录）。' });
      });
    });
  });
}

function firePersonal(id) {
  chrome.storage.local.get(['jz_tasks'], function (d) {
    var tasks = d.jz_tasks || [];
    var idx = -1;
    for (var t = 0; t < tasks.length; t++) { if (tasks[t].id === id) { idx = t; break; } }
    if (idx < 0) return;
    var task = tasks[idx];
    var retryCount = task.retryCount || 0;
    if (retryCount >= 3) {
      notify('瑾之笺：《' + task.title + '》定时发表失败（已重试 3 次），请到公众号后台手动处理。');
      tasks.splice(idx, 1);
      chrome.storage.local.set({ jz_tasks: tasks });
      return;
    }
    tasks.splice(idx, 1);
    chrome.storage.local.set({ jz_tasks: tasks });
    chrome.tabs.create({ url: 'https://mp.weixin.qq.com/' }, function (tab) {
      var onUpd = function (tabId, info) {
        if (tabId === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(onUpd);
          setTimeout(function () {
            chrome.tabs.sendMessage(tab.id, { type: 'auto-publish', html: task.html, title: task.title }, function (resp) {
              if (chrome.runtime.lastError || !resp || !resp.ok) {
                var newRetry = (task.retryCount || 0) + 1;
                notify('瑾之笺：《' + task.title + '》自动发表未成功，' + newRetry + '/3 次重试中……');
                setTimeout(function () {
                  var retryTask = {};
                  var keys = Object.keys(task);
                  for (var k = 0; k < keys.length; k++) retryTask[keys[k]] = task[keys[k]];
                  retryTask.retryCount = newRetry;
                  retryTask.id = null;
                  chrome.storage.local.get(['jz_tasks'], function (d2) {
                    var arr = d2.jz_tasks || [];
                    var newId = 'jz-p-' + Date.now() + '-' + Math.floor(Math.random() * 1000000);
                    retryTask.id = newId;
                    arr.push(retryTask);
                    chrome.storage.local.set({ jz_tasks: arr });
                    try { chrome.alarms.create(newId, { when: Date.now() + 60000 }); }
                    catch (e_alm2) { console.warn('[瑾之笺] retry alarms.create 失败:', e_alm2); }
                  });
                }, 30000);
              } else {
                notify('瑾之笺：《' + task.title + '》已成功发表。');
              }
            });
          }, 2000);
        }
      };
      chrome.tabs.onUpdated.addListener(onUpd);
    });
    notify('瑾之笺：个人号定时已触发，正在自动发表《' + task.title + '》。');
  });
}

function notify(text) {
  try {
    chrome.notifications.create('', {
      type: 'basic',
      iconUrl: 'icons/icon.jpg',
      title: '瑾之笺',
      message: text,
      priority: 2
    });
  } catch (e_notify) {
    console.warn('[瑾之笺] 通知失败:', e_notify);
  }
}

/* ===== 事件监听 ===== */
try {
  chrome.alarms.onAlarm.addListener(function (alarm) {
    try {
      if (typeof alarm.name === 'string' && alarm.name.indexOf('jz-p-') === 0) {
        firePersonal(alarm.name);
      }
    } catch (e_a) { console.error('[瑾之笺] alarms.onAlarm 异常:', e_a); }
  });
} catch (e_alr) { console.warn('[瑾之笺] alarms.onAlarm 注册失败:', e_alr); }

try {
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    try {
      if (!msg) return;
      if (msg.type === 'publish') {
        publish(msg.payload || {}).then(function (r) { sendResponse(r); })
          .catch(function (e) { sendResponse({ ok: false, error: e && e.message || String(e) }); });
        return true;
      }
      if (msg.type === 'schedule-personal') {
        schedulePersonal(msg.task || {}).then(function (r) { sendResponse(r); });
        return true;
      }
      if (msg.type === 'notify') {
        notify(msg.text || '');
        sendResponse({ ok: true });
      }
    } catch (e_msg) {
      console.error('[瑾之笺] onMessage 异常:', e_msg);
      try { sendResponse({ ok: false, error: e_msg && e_msg.message || String(e_msg) }); } catch (_) {}
    }
  });
} catch (e_msgReg) { console.warn('[瑾之笺] onMessage 注册失败:', e_msgReg); }

console.log('[瑾之笺] service worker 初始化完成（v2.0.0 ES5 无依赖版）');

} catch (e_top) {
  /* ===================== 顶层兜底：任何初始化失败都不抛 ===================== */
  console.error('[瑾之笺] service worker 顶层异常:', e_top);
  // 至少要监听到消息才能告诉用户"坏了"，所以这里再尝试一次 onMessage 极简版
  try {
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      if (msg && (msg.type === 'publish' || msg.type === 'schedule-personal')) {
        sendResponse({ ok: false, error: 'Service Worker 初始化失败：' + (e_top && e_top.message || String(e_top)) });
      }
    });
  } catch (_) {}
}
