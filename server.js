/*
 * server.js — 瑾之笺·本地推送服务（独立版权）
 * 仅用 Node 内置模块（http/https），无第三方依赖。
 * 职责：持有 AppID/Secret（来自请求体，不落盘），调用微信草稿/群发接口，
 *       上传文中图片（含 GIF 动态图）到微信图床，支持定时群发（send_time）。
 *       需把本机出口 IP 加入公众号 IP 白名单。个人订阅号无群发 API，会返回明确提示。
 *
 * 共享业务逻辑见 wechat-common.js（apiFriendly / firstNonGifImage / detectMimeFromBuf / isGifSrc）。
 *
 * 启动： node server.js   监听 http://127.0.0.1:8787
 * 接口： POST /api/publish  { appid, secret, title, author, html, scheduleTime }
 *        scheduleTime 为空 => 仅建草稿；有值 => 群发（带定时）
 */
'use strict';
const http = require('http');
const https = require('https');
const { URL } = require('url');
const wc = require('./wechat-common');

const PORT = 8787;
const VERSION = '2.0.0';
const MAX_IMAGE_COUNT = 30;
const MAX_BODY_SIZE = 2 * 1024 * 1024;
let tokenCache = { token: '', expire: 0 };

function req(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opt = { method, hostname: u.hostname, path: u.pathname + u.search, headers: headers || {} };
    const r = https.request(opt, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let json; try { json = JSON.parse(data); } catch (e) { json = { raw: data }; }
        resolve({ status: res.statusCode, json });
      });
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

function getToken(appid, secret) {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expire > now + 60000) return Promise.resolve(tokenCache.token);
  return req('GET', `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`)
    .then((r) => {
      if (r.json.access_token) {
        tokenCache = { token: r.json.access_token, expire: now + (r.json.expires_in || 7200) * 1000 };
        return r.json.access_token;
      }
      const msg = r.json.errmsg || JSON.stringify(r.json);
      if (r.json.errcode === 40125) throw new Error('AppSecret 无效或被停用，请到公众号后台重置。');
      if (r.json.errcode === 40013) throw new Error('AppID 无效，请核对。');
      throw new Error('获取 access_token 失败: ' + msg);
    });
}

function detectMimeFromUrl(url) {
  if (url) {
    const m = /\.(gif|png|jpe?g|webp|bmp|svg)(\?|$)/i.exec(url);
    if (m) return { gif: 'image/gif', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml' }[m[1].toLowerCase()];
  }
  return null;
}

function fetchImage(src) {
  if (src.startsWith('data:')) {
    const m = src.match(/^data:([^;]+);base64,(.*)$/);
    if (!m) return Promise.resolve(null);
    const buf = Buffer.from(m[2], 'base64');
    return Promise.resolve({ buf, mime: m[1] });
  }
  if (!src.startsWith('http')) return Promise.resolve(null);
  return new Promise((resolve) => {
    const u = new URL(src);
    const get = (target) => https.get({ hostname: target.hostname, path: target.pathname + target.search, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        try { return get(new URL(res.headers.location)); } catch (e) { return resolve(null); }
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const mimeFromBuf = wc.detectMimeFromBuf(buf);
        const mimeFromUrl = detectMimeFromUrl(src);
        resolve({ buf, mime: mimeFromBuf === 'image/png' && mimeFromUrl ? mimeFromUrl : mimeFromBuf });
      });
    }).on('error', () => resolve(null));
    get(u);
  });
}

function multipart(token, buffer, mime, fieldName, urlStr) {
  const ext = mime === 'image/gif' ? 'gif' : mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : 'png';
  const filename = 'img.' + ext;
  return new Promise((resolve, reject) => {
    const boundary = '----qs' + Date.now();
    const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`);
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const payload = Buffer.concat([head, buffer, tail]);
    const u = new URL(urlStr);
    const r = https.request({
      method: 'POST', hostname: u.hostname, path: u.pathname + u.search,
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': payload.length }
    }, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('上传图返回异常: ' + d)); } });
    });
    r.on('error', reject);
    r.write(payload); r.end();
  });
}

async function uploadAllImages(token, html) {
  const srcs = wc.extractImageSrcs(html).slice(0, MAX_IMAGE_COUNT);
  for (const src of srcs) {
    const img = await fetchImage(src);
    if (img && img.buf) {
      const doUpload = wc.retry(() => multipart(token, img.buf, img.mime, 'media',
        `https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${token}`),
        { maxAttempts: 2, baseDelay: 500 });
      try {
        const r = await doUpload();
        if (r.url) html = html.split(src).join(r.url);
      } catch (e) {}
    }
  }
  return html;
}

async function publish(p) {
  const token = await getToken(p.appid, p.secret);
  let html = await uploadAllImages(token, p.html);

  const coverSrc = wc.firstNonGifImage(html);
  let thumbMediaId = '';
  if (coverSrc) {
    const img = await fetchImage(coverSrc);
    if (img && img.buf) {
      const coverMime = img.mime === 'image/gif' ? 'image/png' : img.mime;
      const r = await multipart(token, img.buf, coverMime, 'media',
        `https://api.weixin.qq.com/cgi-bin/material/add_material?type=image&access_token=${token}`);
      thumbMediaId = r.media_id;
    }
  }
  if (!thumbMediaId) throw new Error('缺少封面图（文中需至少含一张非 GIF 图片）。');

  const draftBody = JSON.stringify({
    articles: [{
      title: p.title, author: p.author || '',
      digest: p.digest || wc.extractDigest(html, 120),
      content: html, thumb_media_id: thumbMediaId, need_open_comment: 0, only_fans_can_comment: 0
    }]
  });
  const postDraft = wc.retry(() => req('POST', `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${token}`, { 'Content-Type': 'application/json' }, draftBody),
    { maxAttempts: 3, baseDelay: 1000 });
  const draftRes = await postDraft();
  if (draftRes.json.errcode) throw new Error(wc.apiFriendly(draftRes.json, '建草稿'));
  if (!draftRes.json.media_id) throw new Error('建草稿失败: ' + JSON.stringify(draftRes.json));

  if (!p.scheduleTime) {
    return { ok: true, message: '已推送到草稿箱，请到公众号后台审核发布。media_id=' + draftRes.json.media_id };
  }

  const now = Math.floor(Date.now() / 1000);
  if (p.scheduleTime <= now) throw new Error('定时时间需晚于当前时间');
  const sendBody = JSON.stringify({
    filter: { is_to_all: true },
    mpnews: { media_id: draftRes.json.media_id },
    send_time: p.scheduleTime
  });
  const postSend = wc.retry(() => req('POST', `https://api.weixin.qq.com/cgi-bin/message/mass/sendall?access_token=${token}`, { 'Content-Type': 'application/json' }, sendBody),
    { maxAttempts: 3, baseDelay: 1000 });
  const sendRes = await postSend();
  if (sendRes.json.errcode) throw new Error(wc.apiFriendly(sendRes.json, '群发'));
  return { ok: true, message: (p.scheduleTime > now ? '已设置定时群发（' + new Date(p.scheduleTime * 1000).toLocaleString() + '）。' : '已立即群发。') + ' msg_id=' + sendRes.json.msg_id };
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.url === '/api/ping' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, name: '瑾之笺', version: VERSION }));
  }
  if (req.url === '/api/publish' && req.method === 'POST') {
    let body = '';
    let overflow = false;
    req.on('data', (c) => {
      if (body.length + c.length > MAX_BODY_SIZE) { overflow = true; req.destroy(); return; }
      body += c;
    });
    req.on('end', () => {
      if (overflow) { res.writeHead(413); return res.end(JSON.stringify({ ok: false, error: '请求体过大（限制 2MB），请删减文中图片。' })); }
      let p; try { p = JSON.parse(body); } catch (e) { res.writeHead(400); return res.end(JSON.stringify({ ok: false, error: '请求体不是合法 JSON' })); }
      publish(p).then((r) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(r)); })
        .catch((e) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: e.message })); });
    });
    return;
  }
  res.writeHead(404); res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`瑾之笺 v${VERSION} 本地服务已启动: http://127.0.0.1:${PORT}`);
  console.log('GET /api/ping  → 健康检查（返回版本号）');
  console.log('POST /api/publish → 推草稿 / 定时群发');
  console.log('在浏览器打开 index.html，填好 AppID/Secret 与 IP 白名单后即可推送。个人号请使用浏览器插件自动发表。');
});
