/* popup.js — 瑾之笺·凭证配置（独立版权） */
(function () {
  'use strict';
  var VERSION = '2.0.0';
  var $ = function (id) { return document.getElementById(id); };

  $('ver').textContent = 'v' + VERSION;

  chrome.storage.local.get(['jz_appid', 'jz_secret'], function (c) {
    $('appid').value = c.jz_appid || '';
    $('secret').value = c.jz_secret || '';
  });

  function status(msg, isErr) {
    var s = $('st'); s.textContent = msg; s.style.color = isErr ? '#e03131' : '#1a9e57';
  }

  $('save').onclick = function () {
    chrome.storage.local.set({ jz_appid: $('appid').value.trim(), jz_secret: $('secret').value.trim() }, function () {
      status('已保存。');
    });
  };

  $('test').onclick = function () {
    var appid = $('appid').value.trim();
    var secret = $('secret').value.trim();
    if (!appid || !secret) return status('请先填 AppID 和 Secret。', true);
    status('正在测试连接…');
    fetch('https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=' + appid + '&secret=' + secret)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.access_token) status('连接成功！凭证有效。');
        else if (j.errcode === 40125) status('连接失败：AppSecret 无效或被停用。', true);
        else if (j.errcode === 40013) status('连接失败：AppID 无效。', true);
        else if (j.errcode === 40164) status('连接失败：当前 IP 未加入公众号白名单（开发→基本配置→IP 白名单）。', true);
        else status('连接失败：' + (j.errmsg || JSON.stringify(j)), true);
      })
      .catch(function () { status('连接失败：网络请求异常（检查网络或扩展 host_permissions）。', true); });
  };
})();
