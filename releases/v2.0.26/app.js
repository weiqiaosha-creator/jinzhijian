/*
 * app.js — 瑾之笺·独立网页工具交互逻辑（独立版权）
 * 与 converter.js / themes.js 配合；推送走本地 server.js 绕开浏览器 CORS。
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var QS = window.QSConverter;

  var files = [];
  var themeName = 'default';

  // 主题下拉
  var themeSel = $('theme');
  (window.QSThemeOrder || []).forEach(function (k) {
    var t = window.QSThemes[k];
    var o = document.createElement('option');
    o.value = k; o.textContent = t.label + '（' + t.desc + '）';
    themeSel.appendChild(o);
  });
  themeSel.value = themeName;
  themeSel.onchange = function () { themeName = themeSel.value; convertAll(); };

  // 凭证回填
  $('appid').value = localStorage.getItem('jz_appid') || '';
  $('secret').value = localStorage.getItem('jz_secret') || '';
  $('appid').onchange = function () { localStorage.setItem('jz_appid', $('appid').value); };
  $('secret').onchange = function () { localStorage.setItem('jz_secret', $('secret').value); };

  function isPersonal() { return $('acct-personal').checked; }

  // 拖放
  var drop = $('drop');
  drop.onclick = function () { $('file').click(); };
  $('file').onchange = function () { addFiles($('file').files); $('file').value = ''; };
  ['dragenter', 'dragover'].forEach(function (e) {
    drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.add('hot'); });
  });
  ['dragleave', 'drop'].forEach(function (e) {
    drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.remove('hot'); });
  });
  drop.addEventListener('drop', function (ev) { addFiles(ev.dataTransfer.files); });

  function addFiles(fileList) {
    Array.prototype.forEach.call(fileList, function (f) { files.push({ file: f, html: '', error: '' }); });
    convertAll();
  }

  function convertAll() {
    var pending = files.map(function (item) {
      if (item.html || item.error) return Promise.resolve();
      return QS.parseFile(item.file, themeName).then(function (r) {
        item.html = r.html; item.title = r.title; item.kind = r.kind;
      }).catch(function (e) {
        item.error = (e && e.message) ? e.message : String(e);
      });
    });
    Promise.all(pending).then(render);
  }

  function combinedHtml() {
    return files.filter(function (i) { return i.html; }).map(function (i) { return i.html; }).join('');
  }

  function render() {
    var ul = $('fileList'); ul.innerHTML = '';
    files.forEach(function (i) {
      var li = document.createElement('li');
      var name = document.createElement('span'); name.textContent = i.file.name;
      var st = document.createElement('span');
      if (i.error) { st.className = 'err'; st.textContent = '失败: ' + i.error; }
      else if (i.html) { st.className = 'ok'; st.textContent = '已转换'; }
      else { st.className = 'wait'; st.textContent = '转换中…'; }
      li.appendChild(name); li.appendChild(st); ul.appendChild(li);
    });
    var html = combinedHtml();
    $('preview').srcdoc = html
      ? QS.buildClipboardHtml(html, themeName)
      : '<div style="padding:24px;color:#8a93a0;font-family:sans-serif;">拖入文件后将在此显示微信内效果预览</div>';
    if (!$('title').value && files.length && files[0].title) $('title').value = files[0].title;
  }

  // 复制 HTML
  $('copy').onclick = function () {
    var html = combinedHtml();
    if (!html) return setStatus('没有可复制的内容。', true);
    var full = QS.buildClipboardHtml(html, themeName);
    if (navigator.clipboard && window.ClipboardItem) {
      var blob = new Blob([full], { type: 'text/html' });
      navigator.clipboard.write([new ClipboardItem({ 'text/html': blob })]).then(function () {
        setStatus('已复制公众号格式 HTML，到后台 Ctrl+V 粘贴即可（GIF 用 URL 时动画保留）。');
      }).catch(function () { fallbackCopy(full); });
    } else { fallbackCopy(full); }
  };

  function fallbackCopy(full) {
    var ta = document.createElement('textarea');
    ta.value = full; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); setStatus('已复制（兼容模式）。'); }
    catch (e) { setStatus('复制失败，请手动选择预览内容复制。', true); }
    document.body.removeChild(ta);
  }

  // 推送 / 群发
  $('draft').onclick = function () { publish(false); };
  $('send').onclick = function () { publish(true); };

  function publish(withSchedule) {
    var html = combinedHtml();
    if (!html) return setStatus('没有可推送的内容。', true);

    if (isPersonal() && withSchedule) {
      return personalSchedule(html);
    }

    var appid = $('appid').value.trim(), secret = $('secret').value.trim();
    if (isPersonal() && !withSchedule) {
      return setStatus('个人号无草稿 API，请直接用「复制公众号 HTML」到后台粘贴；或安装瑾之笺插件走个人号自动发表。', true);
    }
    if (!appid || !secret) return setStatus('请填写 AppID 与 Secret（仅存本机）。', true);
    var scheduleTime = '';
    if (withSchedule) {
      var v = $('schedule').value;
      if (v) scheduleTime = Math.floor(new Date(v).getTime() / 1000);
    }
    var payload = {
      appid: appid, secret: secret,
      title: $('title').value || (files[0] && files[0].title) || '未命名文章',
      author: $('author').value || '',
      html: html,
      scheduleTime: scheduleTime
    };
    setStatus('正在调用本地服务推送…');
    fetch('http://127.0.0.1:8787/api/publish', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok && res.j.ok) setStatus(res.j.message || '推送成功，请到公众号后台查看。');
        else setStatus('失败：' + (res.j.error || '未知错误') + (res.j.detail ? '（' + res.j.detail + '）' : ''), true);
      }).catch(function () {
        setStatus('连不上本地服务。请先运行 node server.js（详见 README）。', true);
      });
  }

  // 个人号定时（网页工具侧：本地提醒 + 到点自动打开后台并复制）
  function personalSchedule(html) {
    var v = $('schedule').value;
    if (!v) return setStatus('请选择定时时间。', true);
    var ts = new Date(v).getTime();
    if (ts <= Date.now()) return setStatus('定时时间需晚于当前。', true);
    var full = QS.buildClipboardHtml(html, themeName);
    var tasks = JSON.parse(localStorage.getItem('jz_personal_tasks') || '[]');
    tasks.push({ title: $('title').value || (files[0] && files[0].title) || '未命名文章', html: full, ts: ts });
    localStorage.setItem('jz_personal_tasks', JSON.stringify(tasks));
    setStatus('已记录个人号定时任务（' + v + '）。保持本页打开将在到点自动打开后台并复制；真正自动点击发表请用瑾之笺插件。');
    scheduleLocalAlarm(ts, full);
  }

  function scheduleLocalAlarm(ts, full) {
    var delay = ts - Date.now();
    if (delay > 0) setTimeout(function () {
      try {
        if (navigator.clipboard && window.ClipboardItem) {
          navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([full], { type: 'text/html' }) })]);
        }
        window.open('https://mp.weixin.qq.com/', '_blank');
        setStatus('定时已触发：已复制内容并打开公众号后台，请 Ctrl+V 并点击发表。', false);
      } catch (e) { setStatus('定时触发，但自动操作被拦截，请手动打开后台粘贴。', true); }
    }, delay);
  }

  function setStatus(msg, isErr) {
    var s = $('status'); s.textContent = msg; s.style.color = isErr ? '#e03131' : '#1a9e57';
  }

  // 图库面板
  function renderLib() {
    var wrap = $('imglib'); wrap.innerHTML = '';
    (window.QSImageLibrary || []).forEach(function (it) {
      var a = document.createElement('a');
      a.href = it.url; a.target = '_blank'; a.rel = 'noopener';
      a.innerHTML = '<b>' + it.name + '</b> <span>· ' + it.cat + ' · ' + it.license + '</span>';
      wrap.appendChild(a);
    });
  }
  $('imgsearchBtn').onclick = function () {
    var kw = encodeURIComponent($('imgkw').value.trim() || '风景');
    (window.QSImageLibrary || []).forEach(function (it) {
      if (it.search) window.open(it.search.replace('{q}', kw), '_blank');
    });
  };

  renderLib();
  render();
})();