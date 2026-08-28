 1→/* popup.js — 瑾之笺·凭证配置（独立版权） */
 2→(function () {
 3→  'use strict';
 4→  var VERSION = '2.0.0';
 5→  var $ = function (id) { return document.getElementById(id); };
 6→
 7→  $('ver').textContent = 'v' + VERSION;
 8→
 9→  chrome.storage.local.get(['jz_appid', 'jz_secret'], function (c) {
10→    $('appid').value = c.jz_appid || '';
11→    $('secret').value = c.jz_secret || '';
12→  });
13→
14→  function status(msg, isErr) {
15→    var s = $('st'); s.textContent = msg; s.style.color = isErr ? '#e03131' : '#1a9e57';
16→  }
17→
18→  $('save').onclick = function () {
19→    chrome.storage.local.set({ jz_appid: $('appid').value.trim(), jz_secret: $('secret').value.trim() }, function () {
20→      status('已保存。');
21→    });
22→  };
23→
24→  $('test').onclick = function () {
25→    var appid = $('appid').value.trim();
26→    var secret = $('secret').value.trim();
27→    if (!appid || !secret) return status('请先填 AppID 和 Secret。', true);
28→    status('正在测试连接…');
29→    fetch('https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=' + appid + '&secret=' + secret)
30→      .then(function (r) { return r.json(); })
31→      .then(function (j) {
32→        if (j.access_token) status('连接成功！凭证有效。');
33→        else if (j.errcode === 40125) status('连接失败：AppSecret 无效或被停用。', true);
34→        else if (j.errcode === 40013) status('连接失败：AppID 无效。', true);
35→        else if (j.errcode === 40164) status('连接失败：当前 IP 未加入公众号白名单（开发→基本配置→IP 白名单）。', true);
36→        else status('连接失败：' + (j.errmsg || JSON.stringify(j)), true);
37→      })
38→      .catch(function () { status('连接失败：网络请求异常（检查网络或扩展 host_permissions）。', true); });
39→  };
40→})();