  1→/*
  2→ * server.js — 瑾之笺·本地推送服务（独立版权）
  3→ * 仅用 Node 内置模块（http/https），无第三方依赖。
  4→ * 职责：持有 AppID/Secret（来自请求体，不落盘），调用微信草稿/群发接口，
  5→ *       上传文中图片（含 GIF 动态图）到微信图床，支持定时群发（send_time）。
  6→ *       需把本机出口 IP 加入公众号 IP 白名单。个人订阅号无群发 API，会返回明确提示。
  7→ *
  8→ * 共享业务逻辑见 wechat-common.js（apiFriendly / firstNonGifImage / detectMimeFromBuf / isGifSrc）。
  9→ *
 10→ * 启动： node server.js   监听 http://127.0.0.1:8787
 11→ * 接口： POST /api/publish  { appid, secret, title, author, html, scheduleTime }
 12→ *        scheduleTime 为空 => 仅建草稿；有值 => 群发（带定时）
 13→ */
 14→'use strict';
 15→const http = require('http');
 16→const https = require('https');
 17→const { URL } = require('url');
 18→const wc = require('./wechat-common');
 19→
 20→const PORT = 8787;
 21→const VERSION = '2.0.0';
 22→const MAX_IMAGE_COUNT = 30;
 23→const MAX_BODY_SIZE = 2 * 1024 * 1024;
 24→let tokenCache = { token: '', expire: 0 };
 25→
 26→function req(method, url, headers, body) {
 27→  return new Promise((resolve, reject) => {
 28→    const u = new URL(url);
 29→    const opt = { method, hostname: u.hostname, path: u.pathname + u.search, headers: headers || {} };
 30→    const r = https.request(opt, (res) => {
 31→      let data = '';
 32→      res.on('data', (c) => (data += c));
 33→      res.on('end', () => {
 34→        let json; try { json = JSON.parse(data); } catch (e) { json = { raw: data }; }
 35→        resolve({ status: res.statusCode, json });
 36→      });
 37→    });
 38→    r.on('error', reject);
 39→    if (body) r.write(body);
 40→    r.end();
 41→  });
 42→}
 43→
 44→function getToken(appid, secret) {
 45→  const now = Date.now();
 46→  if (tokenCache.token && tokenCache.expire > now + 60000) return Promise.resolve(tokenCache.token);
 47→  return req('GET', `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`)
 48→    .then((r) => {
 49→      if (r.json.access_token) {
 50→        tokenCache = { token: r.json.access_token, expire: now + (r.json.expires_in || 7200) * 1000 };
 51→        return r.json.access_token;
 52→      }
 53→      const msg = r.json.errmsg || JSON.stringify(r.json);
 54→      if (r.json.errcode === 40125) throw new Error('AppSecret 无效或被停用，请到公众号后台重置。');
 55→      if (r.json.errcode === 40013) throw new Error('AppID 无效，请核对。');
 56→      throw new Error('获取 access_token 失败: ' + msg);
 57→    });
 58→}
 59→
 60→function detectMimeFromUrl(url) {
 61→  if (url) {
 62→    const m = /\.(gif|png|jpe?g|webp|bmp|svg)(\?|$)/i.exec(url);
 63→    if (m) return { gif: 'image/gif', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml' }[m[1].toLowerCase()];
 64→  }
 65→  return null;
 66→}
 67→
 68→function fetchImage(src) {
 69→  if (src.startsWith('data:')) {
 70→    const m = src.match(/^data:([^;]+);base64,(.*)$/);
 71→    if (!m) return Promise.resolve(null);
 72→    const buf = Buffer.from(m[2], 'base64');
 73→    return Promise.resolve({ buf, mime: m[1] });
 74→  }
 75→  if (!src.startsWith('http')) return Promise.resolve(null);
 76→  return new Promise((resolve) => {
 77→    const u = new URL(src);
 78→    const get = (target) => https.get({ hostname: target.hostname, path: target.pathname + target.search, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
 79→      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
 80→        try { return get(new URL(res.headers.location)); } catch (e) { return resolve(null); }
 81→      }
 82→      const chunks = [];
 83→      res.on('data', (c) => chunks.push(c));
 84→      res.on('end', () => {
 85→        const buf = Buffer.concat(chunks);
 86→        const mimeFromBuf = wc.detectMimeFromBuf(buf);
 87→        const mimeFromUrl = detectMimeFromUrl(src);
 88→        resolve({ buf, mime: mimeFromBuf === 'image/png' && mimeFromUrl ? mimeFromUrl : mimeFromBuf });
 89→      });
 90→    }).on('error', () => resolve(null));
 91→    get(u);
 92→  });
 93→}
 94→
 95→function multipart(token, buffer, mime, fieldName, urlStr) {
 96→  const ext = mime === 'image/gif' ? 'gif' : mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : 'png';
 97→  const filename = 'img.' + ext;
 98→  return new Promise((resolve, reject) => {
 99→    const boundary = '----qs' + Date.now();
100→    const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`);
101→    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
102→    const payload = Buffer.concat([head, buffer, tail]);
103→    const u = new URL(urlStr);
104→    const r = https.request({
105→      method: 'POST', hostname: u.hostname, path: u.pathname + u.search,
106→      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': payload.length }
107→    }, (res) => {
108→      let d = ''; res.on('data', (c) => (d += c));
109→      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('上传图返回异常: ' + d)); } });
110→    });
111→    r.on('error', reject);
112→    r.write(payload); r.end();
113→  });
114→}
115→
116→async function uploadAllImages(token, html) {
117→  const srcs = wc.extractImageSrcs(html).slice(0, MAX_IMAGE_COUNT);
118→  for (const src of srcs) {
119→    const img = await fetchImage(src);
120→    if (img && img.buf) {
121→      const doUpload = wc.retry(() => multipart(token, img.buf, img.mime, 'media',
122→        `https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${token}`),
123→        { maxAttempts: 2, baseDelay: 500 });
124→      try {
125→        const r = await doUpload();
126→        if (r.url) html = html.split(src).join(r.url);
127→      } catch (e) {}
128→    }
129→  }
130→  return html;
131→}
132→
133→async function publish(p) {
134→  const token = await getToken(p.appid, p.secret);
135→  let html = await uploadAllImages(token, p.html);
136→
137→  const coverSrc = wc.firstNonGifImage(html);
138→  let thumbMediaId = '';
139→  if (coverSrc) {
140→    const img = await fetchImage(coverSrc);
141→    if (img && img.buf) {
142→      const coverMime = img.mime === 'image/gif' ? 'image/png' : img.mime;
143→      const r = await multipart(token, img.buf, coverMime, 'media',
144→        `https://api.weixin.qq.com/cgi-bin/material/add_material?type=image&access_token=${token}`);
145→      thumbMediaId = r.media_id;
146→    }
147→  }
148→  if (!thumbMediaId) throw new Error('缺少封面图（文中需至少含一张非 GIF 图片）。');
149→
150→  const draftBody = JSON.stringify({
151→    articles: [{
152→      title: p.title, author: p.author || '',
153→      digest: p.digest || wc.extractDigest(html, 120),
154→      content: html, thumb_media_id: thumbMediaId, need_open_comment: 0, only_fans_can_comment: 0
155→    }]
156→  });
157→  const postDraft = wc.retry(() => req('POST', `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${token}`, { 'Content-Type': 'application/json' }, draftBody),
158→    { maxAttempts: 3, baseDelay: 1000 });
159→  const draftRes = await postDraft();
160→  if (draftRes.json.errcode) throw new Error(wc.apiFriendly(draftRes.json, '建草稿'));
161→  if (!draftRes.json.media_id) throw new Error('建草稿失败: ' + JSON.stringify(draftRes.json));
162→
163→  if (!p.scheduleTime) {
164→    return { ok: true, message: '已推送到草稿箱，请到公众号后台审核发布。media_id=' + draftRes.json.media_id };
165→  }
166→
167→  const now = Math.floor(Date.now() / 1000);
168→  if (p.scheduleTime <= now) throw new Error('定时时间需晚于当前时间');
169→  const sendBody = JSON.stringify({
170→    filter: { is_to_all: true },
171→    mpnews: { media_id: draftRes.json.media_id },
172→    send_time: p.scheduleTime
173→  });
174→  const postSend = wc.retry(() => req('POST', `https://api.weixin.qq.com/cgi-bin/message/mass/sendall?access_token=${token}`, { 'Content-Type': 'application/json' }, sendBody),
175→    { maxAttempts: 3, baseDelay: 1000 });
176→  const sendRes = await postSend();
177→  if (sendRes.json.errcode) throw new Error(wc.apiFriendly(sendRes.json, '群发'));
178→  return { ok: true, message: (p.scheduleTime > now ? '已设置定时群发（' + new Date(p.scheduleTime * 1000).toLocaleString() + '）。' : '已立即群发。') + ' msg_id=' + sendRes.json.msg_id };
179→}
180→
181→const server = http.createServer((req, res) => {
182→  res.setHeader('Access-Control-Allow-Origin', '*');
183→  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
184→  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
185→  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
186→  if (req.url === '/api/ping' && req.method === 'GET') {
187→    res.writeHead(200, { 'Content-Type': 'application/json' });
188→    return res.end(JSON.stringify({ ok: true, name: '瑾之笺', version: VERSION }));
189→  }
190→  if (req.url === '/api/publish' && req.method === 'POST') {
191→    let body = '';
192→    let overflow = false;
193→    req.on('data', (c) => {
194→      if (body.length + c.length > MAX_BODY_SIZE) { overflow = true; req.destroy(); return; }
195→      body += c;
196→    });
197→    req.on('end', () => {
198→      if (overflow) { res.writeHead(413); return res.end(JSON.stringify({ ok: false, error: '请求体过大（限制 2MB），请删减文中图片。' })); }
199→      let p; try { p = JSON.parse(body); } catch (e) { res.writeHead(400); return res.end(JSON.stringify({ ok: false, error: '请求体不是合法 JSON' })); }
200→      publish(p).then((r) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(r)); })
201→        .catch((e) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: e.message })); });
202→    });
203→    return;
204→  }
205→  res.writeHead(404); res.end('not found');
206→});
207→
208→server.listen(PORT, '127.0.0.1', () => {
209→  console.log(`瑾之笺 v${VERSION} 本地服务已启动: http://127.0.0.1:${PORT}`);
210→  console.log('GET /api/ping  → 健康检查（返回版本号）');
211→  console.log('POST /api/publish → 推草稿 / 定时群发');
212→  console.log('在浏览器打开 index.html，填好 AppID/Secret 与 IP 白名单后即可推送。个人号请使用浏览器插件自动发表。');
213→});