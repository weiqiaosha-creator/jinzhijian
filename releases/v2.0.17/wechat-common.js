/*
 * wechat-common.js — 瑾之笺 · Node 端与浏览器端共享的微信 API 业务逻辑
 * 纯函数，无任何 IO；网络层（fetch/https）由调用方注入。
 *
 * 职责：
 *   · apiFriendly       — 把微信 errcode 翻译成面向用户的中文提示
 *   · firstNonGifImage  — 从文章 HTML 中选出首张非 GIF 图片作为封面
 *   · firstAnyImage     — 退而求其次的首张图片（含 GIF）
 *   · extractImageSrcs  — 从 HTML 中提取所有 <img src> 列表
 *   · detectMimeFromBuf — 依二进制头判断图片 mime（Buffer/Uint8Array 通吃）
 *   · isGifSrc          — 判断一个图片 src 是否为 GIF
 *   · isApiDenied       — 是否为「账号无接口权限」类错误码
 *
 * 本文件为独立版权作品，归瑾之笺所有；可同时被 server.js (Node require)
 * 与 background.js (Chrome MV3 service worker, 同文件列表顺序加载) 引用。
 */
(function (global) {
  'use strict';

  var IMG_SRC_RE = /<img[^>]+src="([^"]+)"/g;
  var GIF_HINT_RE = /(\.gif|data:image\/gif|media\/uploadimg[^"]*gif|uploadimg[^"]*gif)/i;
  var API_DENIED_CODES = [48001, 48002, 48006];

  function isApiDenied(code) {
    return API_DENIED_CODES.indexOf(code) >= 0;
  }

  function apiFriendly(errjson, stage) {
    var code = errjson && errjson.errcode;
    if (isApiDenied(code)) {
      return '该账号无「' + stage + '」接口权限（多为个人订阅号或未微信认证）。请改用插件的「个人号」定时模式，或完成微信认证后再用 API。';
    }
    return stage + '失败: ' + (errjson.errmsg || JSON.stringify(errjson));
  }

  function isGifSrc(src) {
    return GIF_HINT_RE.test(src || '');
  }

  function extractImageSrcs(html) {
    var re = new RegExp(IMG_SRC_RE.source, 'g');
    var m; var out = [];
    while ((m = re.exec(html))) out.push(m[1]);
    return out;
  }

  function firstNonGifImage(html) {
    var srcs = extractImageSrcs(html);
    var first = null;
    for (var i = 0; i < srcs.length; i++) {
      if (first === null) first = srcs[i];
      if (!isGifSrc(srcs[i])) return srcs[i];
    }
    return first;
  }

  function firstAnyImage(html) {
    var srcs = extractImageSrcs(html);
    return srcs.length ? srcs[0] : null;
  }

  function detectMimeFromBuf(buf) {
    if (!buf || buf.length < 4) return 'image/png';
    var b0 = buf[0], b1 = buf[1], b2 = buf[2], b3 = buf[3];
    if (b0 === 0x47 && b1 === 0x49 && b2 === 0x46) return 'image/gif';
    if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4e && b3 === 0x47) return 'image/png';
    if (b0 === 0xff && b1 === 0xd8) return 'image/jpeg';
    if (b0 === 0x25 && b1 === 0x50 && b2 === 0x44 && b3 === 0x46) return 'application/pdf';
    if (b0 === 0x42 && b1 === 0x4d) return 'image/bmp';
    return 'image/png';
  }

  function extractDigest(html, len) {
    var text = String(html || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&[a-z]+;/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    var n = len || 120;
    return text.length > n ? text.slice(0, n) + '…' : text;
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function retry(fn, opts) {
    opts = opts || {};
    var max = opts.maxAttempts || 3;
    var base = opts.baseDelay || 800;
    var backoff = opts.backoff !== undefined ? opts.backoff : 2;
    return function () {
      var args = Array.prototype.slice.call(arguments);
      var self = this;
      var attempt = 0;
      function next() {
        attempt++;
        return Promise.resolve().then(function () { return fn.apply(self, args); })
          .catch(function (err) {
            if (attempt >= max) throw err;
            if (opts.onError) opts.onError(err, attempt);
            var delay = base * Math.pow(backoff, attempt - 1);
            return sleep(delay).then(next);
          });
      }
      return next();
    };
  }

  var api = {
    API_DENIED_CODES: API_DENIED_CODES,
    isApiDenied: isApiDenied,
    apiFriendly: apiFriendly,
    isGifSrc: isGifSrc,
    extractImageSrcs: extractImageSrcs,
    firstNonGifImage: firstNonGifImage,
    firstAnyImage: firstAnyImage,
    detectMimeFromBuf: detectMimeFromBuf,
    extractDigest: extractDigest,
    retry: retry
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.QSWechatCommon = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));