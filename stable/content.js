/*
 * content.js — 瑾之笺·注入微信公众号后台的浮动面板（独立版权）
 * 稳健设计：先创建面板、绑定折叠/拖动等基本交互，再异步等待依赖就绪。
 *          即使 converter/themes 加载失败，面板也能显示并提示错误。
 */
(function () {
  'use strict';
  if (document.getElementById('jz-panel')) return;

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  var panel = document.createElement('div');
  panel.id = 'jz-panel';
  panel.style.cssText = 'position:fixed;right:16px;bottom:16px;width:330px;max-height:82vh;overflow:auto;z-index:99999;background:#fff;border:1px solid #e3e6ea;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.15);font-family:-apple-system,"PingFang SC",sans-serif;font-size:13px;color:#2b3a4a;user-select:none;';
  panel.innerHTML =
    '<div id="jz-head" style="padding:10px 14px;border-bottom:1px solid #eef1f5;font-weight:700;color:#00A86B;display:flex;justify-content:space-between;align-items:center;cursor:move;">瑾之笺 <span id="jz-fold" style="font-size:16px;color:#8a93a0;cursor:pointer;user-select:none;" title="折叠/展开">—</span></div>' +
    '<div id="jz-body" style="padding:12px 14px;display:flex;flex-direction:column;gap:10px;">' +
    '<div id="jz-drop" style="border:2px dashed #c4ccd6;border-radius:8px;padding:16px;text-align:center;color:#8a93a0;cursor:pointer;">拖入 .md/.docx/.pptx<br><span style="font-size:11px;">.doc 转 .docx；支持 GIF</span></div>' +
    '<input id="jz-file" type="file" multiple accept=".md,.markdown,.txt,.docx,.pptx,.doc,.gif" style="display:none;">' +
    '<div style="display:flex;gap:8px;align-items:center;"><label style="color:#8a93a0;">模板</label><select id="jz-theme" style="flex:1;padding:6px;border:1px solid #e3e6ea;border-radius:6px;"></select></div>' +
    '<input id="jz-title" placeholder="标题（可留空）" style="padding:6px;border:1px solid #e3e6ea;border-radius:6px;">' +
    '<div style="display:flex;gap:10px;align-items:center;font-size:12px;color:#8a93a0;"><span title="认证号：需 AppID/Secret，调用微信 API 推草稿/定时群发；个人号：无需凭证，插件到点自动打开后台发表">账号：</span>' +
    '<label><input type="radio" name="jz-acct" id="jz-api" checked> 认证号</label>' +
    '<label><input type="radio" name="jz-acct" id="jz-personal" title="无需 AppID/Secret，插件到点自动打开公众号后台发表（需保持 Chrome 登录）"> 个人号</label></div>' +
    '<div style="display:flex;gap:8px;"><input id="jz-schedule" type="datetime-local" style="flex:1;padding:6px;border:1px solid #e3e6ea;border-radius:6px;"><span style="font-size:11px;color:#8a93a0;align-self:center;" title="认证号：留空=仅推草稿；填了=定时群发。个人号：必填，插件到点自动发表">定时</span></div>' +
    '<div style="display:flex;gap:8px;">' +
    '<button id="jz-preview" style="flex:1;padding:8px;border:none;border-radius:7px;background:#667eea;color:#fff;font-weight:600;cursor:pointer;font-size:12px;">📱 手机预览</button>' +
    '<button id="jz-insert" style="flex:1;padding:8px;border:none;border-radius:7px;background:#00A86B;color:#fff;font-weight:600;cursor:pointer;">插入编辑器</button>' +
    '<button id="jz-send" style="flex:1;padding:8px;border:none;border-radius:7px;background:#e08020;color:#fff;font-weight:600;cursor:pointer;">推/定时</button>' +
    '</div>' +
    '<div id="jz-diagnose" style="font-size:11px;padding:6px 8px;border-radius:5px;background:#f0f2f5;color:#555;margin-top:4px;line-height:1.5;"></div>' +
    '<div id="jz-status" style="font-size:12px;min-height:16px;"></div>' +
    '<details id="jz-imgwrap" style="font-size:12px;color:#8a93a0;display:none;"><summary style="cursor:pointer;color:#667eea;font-weight:600;margin-bottom:4px;">📷 图片证据表</summary><div id="jz-imgtable" style="max-height:140px;overflow:auto;"></div></details>' +
    '<div id="jz-list" style="font-size:12px;color:#8a93a0;"></div>' +
    '</div>';
  document.body.appendChild(panel);

  // ==== 基本交互：折叠 + 拖动（不依赖任何外部库） ====
  try {
    var foldBtn = panel.querySelector('#jz-fold');
    var body2 = panel.querySelector('#jz-body');
    foldBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (body2.style.display === 'none') { body2.style.display = 'flex'; foldBtn.textContent = '—'; }
      else { body2.style.display = 'none'; foldBtn.textContent = '+'; }
    });

    var head = panel.querySelector('#jz-head');
    var dragging = false, dragX = 0, dragY = 0, startLeft = 0, startTop = 0;
    head.addEventListener('mousedown', function (e) {
      if (e.target === foldBtn) return;
      dragging = true; dragX = e.clientX; dragY = e.clientY;
      var rect = panel.getBoundingClientRect();
      startLeft = rect.left; startTop = rect.top;
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
      panel.style.left = startLeft + 'px'; panel.style.top = startTop + 'px';
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      panel.style.left = (startLeft + e.clientX - dragX) + 'px';
      panel.style.top = (startTop + e.clientY - dragY) + 'px';
    });
    document.addEventListener('mouseup', function () { dragging = false; });
  } catch (e) { console.error('[瑾之笺] 基本交互初始化失败:', e); }

  // ==== 诊断条：常驻显示当前模式 / 依赖状态 ====
  function updateDiagnose(st) {
    var d = panel.querySelector('#jz-diagnose');
    if (!d) return;
    if (!st) st = depsStatus();
    var allOk = st.markdownit && st.mammoth && st.JSZip && st.QSWechatCommon && st.QSThemes && st.QSThemeOrder && st.QSConverter;
    if (allOk) {
      d.style.background = '#e6f4ea'; d.style.color = '#1a9e57';
      d.innerHTML = '<b>✅ 完整模式</b> · 40 套主题排版 + 3 种格式解析均已就绪。' +
        '<span style="color:#8a93a0;">markdown-it / mammoth / jszip / themes / converter 全绿。</span>';
      return;
    }
    var missing = [];
    if (!st.markdownit) missing.push('markdown-it库');
    if (!st.mammoth) missing.push('mammoth库');
    if (!st.JSZip) missing.push('jszip库');
    if (!st.QSWechatCommon) missing.push('wechat-common.js');
    if (!st.QSThemes) missing.push('themes.js(QSThemes)');
    if (!st.QSThemeOrder) missing.push('themes.js(QSThemeOrder)');
    if (!st.QSConverter) missing.push('converter.js');
    d.style.background = '#fff4e6'; d.style.color = '#d9480f';
    d.innerHTML = '<b>🚧 降级模式</b> · 当前缺 ' + missing.join('、') +
      '，只能把 md 转成纯文本预览，<b>切换模板无效</b>。' +
      '<div style="margin-top:2px;color:#e03131;">建议：Ctrl+Shift+I 打开控制台，找红色 SyntaxError 截给作者。</div>';
  }

  // ==== 等依赖就绪后再绑定业务逻辑（带诊断） ====
  function depsStatus() {
    return {
      markdownit: !!window.markdownit,
      mammoth: !!window.mammoth,
      JSZip: !!window.JSZip,
      QSWechatCommon: !!window.QSWechatCommon,
      QSThemes: !!window.QSThemes,
      QSThemeOrder: !!window.QSThemeOrder,
      QSConverter: !!window.QSConverter
    };
  }
  function waitForDeps(maxAttempts) {
    var attempts = 0;
    var firstRun = true;
    var timer = setInterval(function () {
      attempts++;
      var st = depsStatus();
      updateDiagnose(st);
      if (st.markdownit && st.mammoth && st.JSZip && st.QSWechatCommon && st.QSThemes && st.QSThemeOrder && st.QSConverter) {
        clearInterval(timer);
        try { initBusiness(); updateDiagnose(st); }
        catch (e) {
          console.error('[瑾之笺] 业务初始化失败:', e);
          status('初始化失败：业务绑定出错（' + e.message + '），请 F12 看 Console 栈。', true);
        }
      } else if (attempts >= maxAttempts) {
        clearInterval(timer);
        var missing = [];
        if (!st.markdownit) missing.push('markdown-it(库)');
        if (!st.mammoth) missing.push('mammoth(库)');
        if (!st.JSZip) missing.push('jszip(库)');
        if (!st.QSWechatCommon) missing.push('wechat-common.js');
        if (!st.QSThemes) missing.push('themes.js');
        if (!st.QSThemeOrder) missing.push('themes.js(主题顺序)');
        if (!st.QSConverter) missing.push('converter.js');
        var tip = '依赖加载超时：缺失 ' + missing.join(', ') +
          '。请 Ctrl+Shift+I 打开 Console 看是否有红色报错（多半是某个库脚本报了 SyntaxError）。';
        console.error('[瑾之笺] 依赖状态:', st, '缺失:', missing);
        status(tip, true);
      } else {
        if (attempts % 3 === 0) {
          console.log('[瑾之笺] 等待依赖 (第 ' + attempts + ' 次检测):', st);
        }
      }
    }, 300);
  }

  function status(msg, err) {
    try {
      var s = panel.querySelector('#jz-status');
      if (s) { s.textContent = msg; s.style.color = err ? '#e03131' : '#1a9e57'; }
    } catch (e) {}
  }

  function initBusiness() {
    var QS = window.QSConverter;
    var themeSel = panel.querySelector('#jz-theme');
    (window.QSThemeOrder || []).forEach(function (k) {
      var t = window.QSThemes[k];
      if (!t) return;
      var o = document.createElement('option');
      o.value = k; o.textContent = t.label;
      themeSel.appendChild(o);
    });

    var files = [];
    var themeName = 'default';
    // ⚠ 修复：getTheme 变量声明丢失导致"手机预览失败：getTheme is not defined"
    var getTheme = (window.QSConverter && typeof window.QSConverter.getTheme === 'function')
      ? window.QSConverter.getTheme
      : function (_name) {
          return {
            label: '默认简约',
            container: { background: '#00A86B', padding: '20px', lineHeight: '1.75', fontSize: '15px' }
          };
        };
    // 模板切换：清空所有已转换结果 → 重新转换（才能应用新主题样式）
    themeSel.onchange = function () {
      themeName = themeSel.value;
      for (var i = 0; i < files.length; i++) {
        files[i].html = '';
        files[i].error = '';
        files[i].title = files[i].title; // 保留标题
        delete files[i].degraded;
      }
      status('切换模板为：' + (themeSel.options[themeSel.selectedIndex].textContent || themeName));
      convertAll();
    };

    var drop = panel.querySelector('#jz-drop');
    drop.onclick = function () { panel.querySelector('#jz-file').click(); };
    panel.querySelector('#jz-file').onchange = function (e) { addFiles(e.target.files); e.target.value = ''; };
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.style.borderColor = '#00A86B'; }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.style.borderColor = '#c4ccd6'; }); });
    drop.addEventListener('drop', function (e) { addFiles(e.dataTransfer.files); });

    function addFiles(list) {
      Array.prototype.forEach.call(list, function (f) { files.push({ file: f, html: '', error: '' }); });
      convertAll();
    }

    // 降级转换：当 QS.parseFile 不可用时，直接把文件内容包成 <pre> 或 <img>
    function fallbackParse(file) {
      var name = file.name || '';
      var ext = name.split('.').pop().toLowerCase();
      var fallbackTitle = name.replace(/\.[^.]+$/, '') || '未命名';
      if (ext === 'md' || ext === 'markdown' || ext === 'txt') {
        return file.text().then(function (t) {
          var escaped = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          var html = '<pre style="white-space:pre-wrap;font-family:Consolas,Menlo,monospace;background:#f5f5f5;padding:12px;border-radius:6px;font-size:13px;">' + escaped + '</pre>';
          return { html: html, title: fallbackTitle, kind: ext, degraded: true };
        });
      }
      if (/^(png|jpg|jpeg|gif|webp|bmp)$/.test(ext)) {
        return file.arrayBuffer().then(function (ab) {
          var bytes = new Uint8Array(ab);
          var binary = '';
          for (var i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
          var mime = ext === 'jpg' ? 'image/jpeg' : ('image/' + ext);
          var src = 'data:' + mime + ';base64,' + btoa(binary);
          return { html: '<p><img src="' + src + '"></p>', title: fallbackTitle, kind: ext, degraded: true };
        });
      }
      return Promise.reject(new Error('降级模式暂不支持 .' + ext + '（仅 md/txt/图片可降级）'));
    }

    function convertAll() {
      var ps = files.map(function (it) {
        if (it.html || it.error) return Promise.resolve();
        var hasFull = window.QSConverter && window.QSConverter.parseFile;
        var runner = hasFull
          ? window.QSConverter.parseFile(it.file, themeName)
          : fallbackParse(it.file);
        return runner.then(function (r) {
          it.html = r.html;
          it.title = r.title;
          if (r.warnings && r.warnings.length) it.warnings = r.warnings; else delete it.warnings;
          // ⚠ 修复：同步 degraded 标记（缺这个降级提示永远不显示）
          if (r.degraded) it.degraded = true; else delete it.degraded;
        }).catch(function (e) { it.error = (e && e.message) || String(e); });
      });
      Promise.all(ps).then(renderList).catch(function (e) {
        console.error('[瑾之笺] convertAll 异常:', e);
        status('转换流程异常: ' + (e && e.message || e), true);
      });
    }
    function combined() { return files.filter(function (i) { return i.html; }).map(function (i) { return i.html; }).join(''); }
    function renderList() {
      var ul = panel.querySelector('#jz-list'); ul.innerHTML = '';
      var degraded = false;
      for (var idx = 0; idx < files.length; idx++) {
        (function (i, fixedIdx) { // 闭包捕获固定索引
          var wrap = document.createElement('div');
          wrap.style.display = 'flex';
          wrap.style.alignItems = 'center';
          wrap.style.gap = '6px';
          wrap.style.padding = '3px 0';

          var d = document.createElement('div');
          d.style.flex = '1';
          d.style.overflow = 'hidden';
          d.style.textOverflow = 'ellipsis';
          d.style.whiteSpace = 'nowrap';
          var err = i.error && i.error.indexOf('Markdown 语法不支持') === 0;
          var warn = i.warnings && i.warnings.length;
          if (i.degraded) degraded = true;
          var label = (i.degraded ? '🚧 降级 ' : '') + i.file.name + '：' +
            (i.error ? (err ? '⚠ ' + i.error.split('\n').slice(0, 2).join(' | ') : '失败 ' + i.error) :
             (warn ? '⚠ ' + i.warnings.length + ' 条提示' :
              (i.html ? '已转换' : '转换中')));
          d.textContent = label;
          d.style.color = i.degraded ? '#e08020' : (i.error ? '#e03131' : (warn ? '#d37a00' : (i.html ? '#1a9e57' : '#8a93a0')));
          if (err || i.error || warn) d.style.cursor = 'pointer';
          d.onclick = function () {
            if (i.error) alert(i.error);
            else if (warn) {
              var ws = [];
              for (var w = 0; w < i.warnings.length; w++) ws.push('第 ' + i.warnings[w].line + ' 行: ' + i.warnings[w].name + ' — ' + i.warnings[w].hint);
              alert('渲染提示（不影响插入）：\n' + ws.join('\n'));
            }
          };
          wrap.appendChild(d);

          var delBtn = document.createElement('button');
          delBtn.textContent = '×';
          delBtn.title = '从列表移除';
          delBtn.style.cssText = 'width:20px;height:20px;border:none;border-radius:50%;background:#f5f5f5;color:#c92a2a;cursor:pointer;font-size:14px;line-height:20px;padding:0;display:flex;align-items:center;justify-content:center;flex-shrink:0;';
          delBtn.onmouseenter = function () { delBtn.style.background = '#ffe3e3'; };
          delBtn.onmouseleave = function () { delBtn.style.background = '#f5f5f5'; };
          delBtn.onclick = function (e) {
            e.stopPropagation();
            files.splice(fixedIdx, 1);
            renderList();
            var titleEl = panel.querySelector('#jz-title');
            if (titleEl && files.length === 0) titleEl.value = '';
            else if (titleEl && !titleEl.value && files[0] && files[0].title) titleEl.value = files[0].title;
          };
          wrap.appendChild(delBtn);
          ul.appendChild(wrap);
        })(files[idx], idx);
      }
      var titleEl = panel.querySelector('#jz-title');
      if (!titleEl.value && files[0] && files[0].title) titleEl.value = files[0].title;

      // ==== 图片证据表（降级模式跳过） ====
      var imgWrap = panel.querySelector('#jz-imgwrap');
      var imgTable = panel.querySelector('#jz-imgtable');
      if (window.QSConverter && window.QSConverter.extractImageList) {
        var allImgHtml = combined();
        var imgList = window.QSConverter.extractImageList(allImgHtml);
        if (imgList.length) {
          imgWrap.style.display = 'block';
          var rows = [];
          for (var k = 0; k < imgList.length; k++) {
            var img = imgList[k];
            rows.push('<div style="padding:3px 0;border-bottom:1px dashed #eef1f5;">#' + img.index + ' ' +
              (img.alt ? '<span style="color:#667eea;">「' + img.alt + '」</span> ' : '') +
              '<span style="color:#8a93a0;font-size:11px;">' + img.src + '</span>' +
              (img.isDataUri ? ' <span style="color:#e08020;font-size:11px;">[内嵌base64]</span>' : '') + '</div>');
          }
          imgTable.innerHTML = rows.join('');
        } else {
          imgWrap.style.display = 'none';
        }
      } else {
        imgWrap.style.display = 'none';
      }

      // 降级模式状态栏提示
      if (degraded || !window.QSConverter) {
        status('🚧 当前为降级模式（' +
          (window.QSConverter ? '个别文件降级' : 'converter.js 未加载成功') +
          '），已保留原始内容预览，md 主题样式未生效。建议 F12 查看 Console 报错。', true);
      }
    }
    function isPersonal() { return panel.querySelector('#jz-personal').checked; }

    function findEditor() {
      // ------- 优先级 1：微信公众号正文编辑器【专属选择器】（100% 精准命中）-------
      var WECHAT_EDITOR_SELECTORS = [
        '#js_content',                       // 新版图文素材正文 ID（新版）
        '.js_editor_content',                // 老版公众号正文 class（最常用）
        '.rich_media_editor_content',        // 富媒体编辑器主容器
        '.appmsg_edit_area [contenteditable="true"]',
        '.weui-desktop-editor [contenteditable="true"]',
        '.mpaas-editor-root [contenteditable="true"]',
        '.mp-editor [contenteditable="true"]'
      ];
      for (var w = 0; w < WECHAT_EDITOR_SELECTORS.length; w++) {
        try {
          var hit = document.querySelector(WECHAT_EDITOR_SELECTORS[w]);
          if (hit && hit.offsetParent !== null && hit.offsetHeight > 120) return hit;
        } catch (e_try) {}
      }
      // ------- 优先级 2：iframe 内的 UEditor 正文 -------
      var iframes = ['#ueditor_0', '.edui-editor-iframeholder iframe', '#iframe_ue', '.edui-body-container'];
      for (var i = 0; i < iframes.length; i++) {
        var ifr = document.querySelector(iframes[i]);
        if (ifr && ifr.contentDocument && ifr.contentDocument.body) {
          var b = ifr.contentDocument.body;
          if (b && (b.isContentEditable || b.getAttribute('contenteditable') === 'true') && b.offsetHeight > 120) return b;
          var inner = ifr.contentDocument.querySelector('[contenteditable="true"]');
          if (inner && inner.offsetHeight > 120) return inner;
        }
      }
      var allIframes = document.querySelectorAll('iframe');
      for (var j = 0; j < allIframes.length; j++) {
        try {
          var doc = allIframes[j].contentDocument;
          if (!doc) continue;
          var ed = doc.querySelector('[contenteditable="true"]') || (doc.body && doc.body.isContentEditable ? doc.body : null);
          if (ed && ed.offsetHeight > 120) return ed;
        } catch (e_iframe) {}
      }
      // ------- 优先级 3：兜底——所有 contenteditable 中面积最大的那一个（排除标题输入框这种小尺寸） -------
      var allCE = Array.prototype.slice.call(document.querySelectorAll('[contenteditable="true"]'));
      var filtered = allCE.filter(function (el) {
        return el.offsetParent !== null && (el.offsetWidth * el.offsetHeight) > 80000 && el.offsetHeight > 200;
      });
      if (filtered.length) {
        filtered.sort(function (a, b) { return (b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight); });
        return filtered[0];
      }
      // ------- 最后兜底：还找不到就 null -------
      return null;
    }

    function copyHtml(full) {
      return new Promise(function (resolve, reject) {
        if (navigator.clipboard && window.ClipboardItem) {
          navigator.clipboard.write([new ClipboardItem({
            'text/html': new Blob([full], { type: 'text/html' }),
            'text/plain': new Blob([stripHtml(full)], { type: 'text/plain' })
          })]).then(resolve).catch(reject);
        } else {
          // Fallback：兼容老浏览器/HTTPS 下 clipboard 不可用
          try {
            var ta = document.createElement('textarea');
            ta.value = stripHtml(full);
            ta.style.position = 'fixed'; ta.style.top = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            var ok = document.execCommand('copy');
            document.body.removeChild(ta);
            if (ok) resolve(); else reject(new Error('execCommand copy failed'));
          } catch (e) { reject(e); }
        }
      });
    }

    function stripHtml(html) {
      var tmp = document.createElement('div');
      tmp.innerHTML = html || '';
      return (tmp.textContent || tmp.innerText || '').trim();
    }

    // 页面中央大浮层提示（2.5 秒自动消失）
    function toast(msg, color) {
      var c = color || '#00A86B';
      var el = document.createElement('div');
      el.textContent = msg;
      el.style.cssText = 'position:fixed;top:30%;left:50%;transform:translateX(-50%);padding:14px 28px;background:' + c +
        ';color:#fff;font-weight:600;font-size:16px;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,.25);z-index:999999;letter-spacing:.5px;';
      document.body.appendChild(el);
      setTimeout(function () {
        el.style.transition = 'opacity .4s';
        el.style.opacity = '0';
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 500);
      }, 2500);
    }

    // 编辑器里粘贴：优先 Clipboard API read 回 → dispatchEvent('paste') 模拟粘贴；
    // 否则 execCommand('paste')；再不行提示用户 Ctrl+V
    function pasteIntoEditor(ed, wrapped) {
      return new Promise(function (resolve) {
        if (!ed) { resolve(false); return; }
        try { ed.focus(); } catch (e) {}
        // 1) 先尝试：write 到 clipboard 后再 execCommand('paste')（很多老浏览器支持）
        try {
          var pasted = document.execCommand('paste');
          if (pasted) { resolve(true); return; }
        } catch (e) { /* ignore */ }
        // 2) 再尝试：构造 PasteEvent，用 clipboardData 注入
        try {
          if (window.ClipboardEvent) {
            var dt = new DataTransfer();
            dt.items.add(new File([wrapped], 'paste.html', { type: 'text/html' }));
            // 兼容：用 ClipboardItem 不可构造时走字符串
            var ev = new ClipboardEvent('paste', {
              bubbles: true,
              cancelable: true,
              // @ts-ignore
              clipboardData: {
                getData: function (t) { return t === 'text/html' ? wrapped : stripHtml(wrapped); },
                types: ['text/html', 'text/plain']
              }
            });
            var ok = ed.dispatchEvent(ev);
            if (ok && ev.defaultPrevented) { resolve(true); return; }
          }
        } catch (e) { /* ignore */ }
        resolve(false);
      });
    }

    // ========== 【核心：样式内联化 + DOM 物理迁移】==========
    function buildContainerCss(name) {
      var theme = window.QSThemes ? (window.QSThemes[name] || window.QSThemes['default']) : null;
      if (!theme || !theme.container) return 'padding:20px;line-height:1.75;font-size:15px;word-break:break-word;';
      return objToCss(theme.container);
    }
    // 把 { color:'green', fontSize:'22px' } 转成 "color:green;font-size:22px;"（驼峰→kebab-case）
    function objToCss(o) {
      if (!o) return '';
      var s = '';
      for (var k in o) {
        if (!o.hasOwnProperty(k)) continue;
        if (k === 'macStyle' || k === 'slide' || k === 'numberColor') continue;
        var p = k.replace(/([A-Z])/g, '-$1').toLowerCase();
        s += p + ':' + o[k] + ';';
      }
      return s;
    }
    // 把 themes.js 的样式对象 → 逐个元素写 style attribute（内联后编辑器不丢格式）
    function inlineThemeStyles(html, name) {
      var theme = window.QSThemes ? (window.QSThemes[name] || window.QSThemes['default']) : null;
      var tmp = document.createElement('div');
      tmp.innerHTML = html || '';
      var TAG_MAP = { h1:'h1', h2:'h2', h3:'h3', h4:'h4', p:'p', a:'a', strong:'strong',
        blockquote:'blockquote', pre:'pre', table:'table', img:'img', hr:'hr', em:'em' };
      if (theme) {
        for (var t in TAG_MAP) {
          if (!TAG_MAP.hasOwnProperty(t) || !theme[t]) continue;
          var css = objToCss(theme[t]);
          if (!css) continue;
          var nodes = tmp.querySelectorAll(TAG_MAP[t]);
          for (var i = 0; i < nodes.length; i++) {
            var oldS = nodes[i].getAttribute('style') || '';
            nodes[i].setAttribute('style', css + oldS);
          }
        }
        // 行内 code（不在 pre 内的）用 codeInline 样式
        if (theme.codeInline) {
          var cCss = objToCss(theme.codeInline);
          var codes = tmp.querySelectorAll('code');
          for (var j = 0; j < codes.length; j++) {
            var pn = codes[j].parentNode;
            if (pn && pn.tagName === 'PRE') continue;
            var oldC = codes[j].getAttribute('style') || '';
            codes[j].setAttribute('style', cCss + oldC);
          }
        }
      }
      // 兜底：原生列表样式（圆点/编号+缩进，微信默认可能被清）
      var listRules = {
        'ul': 'list-style:disc;padding-left:24px;margin:12px 0;',
        'ol': 'list-style:decimal;padding-left:24px;margin:12px 0;',
        'li': 'margin:6px 0;line-height:1.75;'
      };
      for (var ls in listRules) {
        var ln = tmp.querySelectorAll(ls);
        for (var k = 0; k < ln.length; k++) {
          var oldL = ln[k].getAttribute('style') || '';
          ln[k].setAttribute('style', oldL + listRules[ls]);
        }
      }
      return tmp.innerHTML;
    }
    function insertStyledDom(ed, html, name) {
      if (!ed) return { ok: false, reason: 'editor-not-found' };
      try {
        // Step 1: 把 themes.js 的样式对象 → 逐个元素写 style attribute（内联，编辑器没有 <style> 标签只能靠这个）
        var styledHtml = inlineThemeStyles(html, name);
        // Step 2: 构造 wrapper（container 样式也内联 + 强制块级/全宽，防止父容器行内布局破坏）
        var css = buildContainerCss(name);
        var wrap = document.createElement('div');
        wrap.setAttribute('style', 'display:block !important;width:100%;box-sizing:border-box;' + css);
        wrap.setAttribute('data-jianzhi-wrapper', '1');
        wrap.innerHTML = styledHtml;
        // Step 3: 清空编辑器原有内容，物理 appendChild（DOM 迁移不经过 HTML 清洗器，样式 100% 保留）
        while (ed.firstChild) ed.removeChild(ed.firstChild);
        ed.appendChild(wrap);
        try { ed.focus(); } catch (e_f) {}
        // 调试用（用户不可见，方便以后控制台检查）
        try { window.__jianzhiDebug = { wrap: wrap, name: name, editor: ed }; } catch (e_w) {}
        return { ok: true };
      } catch (e_ins) {
        return { ok: false, reason: 'insert-fail' };
      }
    }

    // ==== 📱 手机预览（390px 视口模拟 + 预览窗内置复制按钮） ====
    panel.querySelector('#jz-preview').onclick = function () {
      try {
        var html = combined(); if (!html) { status('没有可预览的内容。', true); return; }
        var theme = getTheme(themeName);
        var headColor = (theme.container && theme.container.background) ? theme.container.background : '#00A86B';
        var themeLabel = (themeSel.options[themeSel.selectedIndex] || {}).textContent || themeName;

        // 注意：预览窗口 HTML 内的 onclick 不能访问 content_script 的函数，
        // 所以把 buildClipboardHtml 展开的结果、复制脚本、按钮一起内嵌到页面里
        var containerCss = '';
        if (window.QSConverter && theme.container) {
          // 把 theme.container 的样式平铺出来，复制时用的 <div style=""> 就会有 padding/line-height/font
          for (var k in theme.container) {
            if (!Object.prototype.hasOwnProperty.call(theme.container, k)) continue;
            if (k === 'macStyle') continue;
            containerCss += k + ':' + theme.container[k] + ';';
          }
        }
        containerCss = containerCss || 'padding:20px;line-height:1.75;font-size:15px;word-break:break-word;';

        var wrapForCopy = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div style="' + containerCss + '">' + html + '</div></body></html>';

        // ========== 极简预览 HTML（内嵌脚本只留最少，逻辑靠后续动态插入 script 标签） ==========
        var previewHtml = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
          '<meta name="viewport" content="width=390">' +
          '<title>瑾之笺·手机预览</title>' +
          '<style>' +
            'body{margin:0;background:#f2f3f5;padding:16px 0 28px;display:flex;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;}' +
            '.phone{width:390px;background:#fff;min-height:600px;box-shadow:0 8px 40px rgba(0,0,0,.15);border-radius:14px;overflow:hidden;}' +
            '.phone-head{background:' + headColor + ';color:#fff;padding:12px 16px;font-size:14px;font-weight:600;display:flex;align-items:center;gap:10px;}' +
            '.phone-head span.theme{background:rgba(255,255,255,.22);padding:3px 10px;border-radius:20px;font-size:12px;font-weight:500;margin-left:auto;}' +
            '.copybar{display:flex;gap:10px;padding:10px 16px;border-bottom:1px solid #eef1f5;align-items:center;}' +
            '.btn{flex:1;padding:11px 6px;border:none;border-radius:8px;background:#00A86B;color:#fff;font-weight:600;font-size:14px;cursor:pointer;line-height:1.4;}' +
            '.btn.alt{background:#667eea;flex:1.4;}' +
            '.btn.gray{background:#86909c;flex:0.6;}' +
            '.tip{padding:10px 16px;background:#fafbfc;border-bottom:1px solid #eef1f5;font-size:12px;color:#646a73;line-height:1.7;}' +
            '.tip em{color:#e94d4d;font-style:normal;font-weight:700;}' +
            '.toast{position:fixed;top:28%;left:50%;transform:translateX(-50%);padding:12px 22px;background:#00A86B;color:#fff;font-weight:600;font-size:14px;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.2);z-index:9999;}' +
          '</style></head><body>' +
          '<div class="phone">' +
            '<div class="phone-head">📱 390px 手机预览 <span class="theme">主题：' + escapeHtml(themeLabel) + '</span></div>' +
            '<div class="tip">' +
              '🎓 三档复制（越靠后越稳）：<br>' +
              '① <em>一键复制</em> → 回编辑器 <em>Ctrl+V</em>（最快）<br>' +
              '② 样式不对 → 点「全选」→ 自己按 <em>Ctrl+C</em> → Ctrl+V<br>' +
              '③ 最稳：鼠标拖选所有内容 → Ctrl+C → Ctrl+V' +
            '</div>' +
            '<div class="copybar">' +
              '<button class="btn alt" id="copyBtn">📋 一键复制（推荐）</button>' +
              '<button class="btn gray" id="selBtn">🎯 全选</button>' +
            '</div>' +
            '<div id="previewBody" style="' + containerCss + '">' + html + '</div>' +
          '</div>' +
          '</body></html>';

        var w = window.open('', 'jz_mobile_preview_' + Date.now(), 'width=430,height=820,scrollbars=yes,menubar=no,toolbar=no,location=no');
        if (!w) {
          toast('⚠️ 浏览器拦截了弹窗', '#d9480f');
          status('浏览器拦截了弹出窗口。请在地址栏右侧点「已阻止的弹出内容」，允许 mp.weixin.qq.com 弹窗后重试。', true);
          return;
        }
        try {
          w.document.open(); w.document.write(previewHtml); w.document.close();
        } catch (e_doc) {
          // 某些情况跨窗口写 document 被拦 → data URL 兜底
          var dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(previewHtml);
          try { w.location.href = dataUrl; } catch (_) {}
        }

        // ========== 关键：预览窗口脚本【动态插入】 —— 不再拼字符串进 previewHtml ==========
        // （彻底绕开"JS 代码塞进字符串字面量 → 引号转义错误 → content.js 抛 SyntaxError → 扩展变红"错误"的链条）
        try {
          w.addEventListener('load', function () {
            try {
              var scriptEl = w.document.createElement('script');
              var codeArr = [];
              codeArr.push('window.__jz_copy_html__ = ' + JSON.stringify(wrapForCopy) + ';');
              codeArr.push('function __jzShowToast(msg,color){');
              codeArr.push('  var el=document.createElement("div");');
              codeArr.push('  el.className="toast";');
              codeArr.push('  el.style.background=color||"#00A86B";');
              codeArr.push('  el.textContent=msg;');
              codeArr.push('  document.body.appendChild(el);');
              codeArr.push('  setTimeout(function(){');
              codeArr.push('    el.style.transition="opacity .3s";el.style.opacity=0;');
              codeArr.push('    setTimeout(function(){if(el.parentNode)el.parentNode.removeChild(el);},400);');
              codeArr.push('  },2200);');
              codeArr.push('}');
              codeArr.push('function __jzSelectAll(){');
              codeArr.push('  var body=document.getElementById("previewBody");');
              codeArr.push('  if(!body){return false;}');
              codeArr.push('  var range=document.createRange();');
              codeArr.push('  range.selectNodeContents(body);');
              codeArr.push('  var sel=window.getSelection();');
              codeArr.push('  sel.removeAllRanges();');
              codeArr.push('  sel.addRange(range);');
              codeArr.push('  return true;');
              codeArr.push('}');
              codeArr.push('function __jzCopyBySelection(){');
              codeArr.push('  try{');
              codeArr.push('    if(!__jzSelectAll()){return false;}');
              codeArr.push('    var ok=document.execCommand("copy");');
              codeArr.push('    window.getSelection().removeAllRanges();');
              codeArr.push('    return !!ok;');
              codeArr.push('  }catch(e){return false;}');
              codeArr.push('}');
              codeArr.push('document.getElementById("copyBtn").onclick=function(){');
              codeArr.push('  var ok=__jzCopyBySelection();');
              codeArr.push('  if(ok){__jzShowToast("✅ 已复制！回编辑器按 Ctrl+V","#00A86B");return;}');
              codeArr.push('  if(!navigator.clipboard || !window.ClipboardItem){');
              codeArr.push('    __jzShowToast("📌 请点「全选」自己按 Ctrl+C（最稳）","#646a73");');
              codeArr.push('    __jzSelectAll();');
              codeArr.push('    return;');
              codeArr.push('  }');
              codeArr.push('  var txt=(document.getElementById("previewBody")||{}).innerText||"";');
              codeArr.push('  try{');
              codeArr.push('    navigator.clipboard.write([new ClipboardItem({');
              codeArr.push('      "text/html":new Blob([window.__jz_copy_html__],{type:"text/html"}),');
              codeArr.push('      "text/plain":new Blob([txt],{type:"text/plain"})');
              codeArr.push('    })]).then(function(){');
              codeArr.push('      __jzShowToast("⚠️ API复制，如样式丢请改用「全选」手动 Ctrl+C","#d9480f");');
              codeArr.push('    }).catch(function(){');
              codeArr.push('      __jzShowToast("📌 请点「全选」自己按 Ctrl+C","#646a73");__jzSelectAll();');
              codeArr.push('    }));');
              codeArr.push('  }catch(e3){__jzShowToast("📌 请点「全选」自己按 Ctrl+C","#646a73");__jzSelectAll();}');
              codeArr.push('};');
              codeArr.push('document.getElementById("selBtn").onclick=function(){');
              codeArr.push('  if(__jzSelectAll()){__jzShowToast("✅ 已全选，请按 Ctrl+C 复制（最稳方式）","#667eea");}');
              codeArr.push('  else{__jzShowToast("请鼠标拖选下面内容","#d9480f");}');
              codeArr.push('};');
              scriptEl.textContent = codeArr.join('\n');
              w.document.body.appendChild(scriptEl);
            } catch (e_inj) { console.warn('[瑾之笺] 预览窗脚本注入失败:', e_inj); }
          });
        } catch (e_load) { console.warn('[瑾之笺] 预览窗 addEventListener 失败:', e_load); }

        status('手机预览已打开（390px 宽）。三档复制方式写在预览窗顶部。');
      } catch (e) {
        console.error('[瑾之笺] 手机预览异常:', e);
        toast('手机预览失败：' + (e && e.message || e), '#d9480f');
        status('手机预览异常：' + (e && e.message || e), true);
      }
    };

    panel.querySelector('#jz-insert').onclick = function () {
      var html = combined(); if (!html) { status('没有可插入的内容。', true); return; }
      var themeLabel = (themeSel.options[themeSel.selectedIndex] || {}).textContent || themeName;
      var ed = findEditor();
      var r = insertStyledDom(ed, html, themeName);
      if (r.ok) {
        toast('✅ 已插入（主题：' + themeLabel + '）', '#00A86B');
        status('已直接插入编辑器（主题：' + themeLabel + '）——DOM 物理迁移，样式不会被微信清洗。');
      } else {
        toast('⚠️ ' + (r.reason || '插入失败'), '#d9480f');
        status('插入失败：' + (r.reason || '未知错误'), true);
      }
    };

    // ==== 推送前安全检查（QS.securityCheck 不存在时跳过） ====
    panel.querySelector('#jz-send').onclick = function () {
      var html = combined(); if (!html) return status('没有可推送的内容。', true);
      var title = panel.querySelector('#jz-title').value || (files[0] && files[0].title) || '未命名文章';

      if (window.QSConverter && window.QSConverter.securityCheck) {
        var sec = window.QSConverter.securityCheck(html + title);
        if (sec.level === 'danger') {
          var dn = [];
          for (var i = 0; i < sec.findings.length; i++) {
            if (sec.findings[i].level === 'danger') dn.push(sec.findings[i].name);
          }
          var dangerNames = dn.join('、');
          if (!confirm('⚠️ 安全检查发现高危敏感信息：\n\n' + dangerNames + '\n\n强烈建议先修复再推送（避免泄露 AppSecret / Token / 本地路径）。\n\n仍要继续吗？')) {
            status('已取消推送，请先处理敏感信息。', true); return;
          }
        } else if (sec.level === 'warn') {
          var wn = [];
          for (var j = 0; j < sec.findings.length; j++) wn.push(sec.findings[j].name);
          console.warn('[瑾之笺] 安全检查发现警告级别的残留：', wn.join('、'));
        }
      }

      if (isPersonal()) {
        var sched = panel.querySelector('#jz-schedule').value;
        if (!sched) return status('个人号请填写定时时间。', true);
        var ts = Math.floor(new Date(sched).getTime() / 1000);
        if (ts <= Math.floor(Date.now() / 1000)) return status('定时时间需晚于当前。', true);
        chrome.runtime.sendMessage({ type: 'schedule-personal', task: { title: title, html: html, ts: ts } }, function (r) {
          if (r && r.ok) status(r.message); else status('登记失败：' + ((r && r.error) || '未知'), true);
        });
        return;
      }
      var payload = { title: title, html: html, scheduleTime: panel.querySelector('#jz-schedule').value ? Math.floor(new Date(panel.querySelector('#jz-schedule').value).getTime() / 1000) : '' };
      status('读取凭证并推送中…');
      chrome.storage.local.get(['jz_appid', 'jz_secret'], function (cfg) {
        if (!cfg.jz_appid || !cfg.jz_secret) return status('请先在插件弹窗填 AppID/Secret。', true);
        payload.appid = cfg.jz_appid; payload.secret = cfg.jz_secret;
        chrome.runtime.sendMessage({ type: 'publish', payload: payload }, function (resp) {
          if (resp && resp.ok) status(resp.message); else status('失败：' + ((resp && resp.error) || '未知'), true);
        });
      });
    };

    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      if (msg && msg.type === 'auto-publish') { autoPublish(msg.html, msg.title); sendResponse({ ok: true }); }
    });

    function autoPublish(html, title) {
      status('瑾之笺·定时触发：正在尝试自动发表…');
      var attempts = 0; var maxAttempts = 20; var openedEditor = false;

      function tryOpenEditor() {
        var links = Array.prototype.slice.call(document.querySelectorAll('a, button'));
        var hit = links.find(function (el) { var t = (el.textContent || '').trim(); return /新建图文|添加|图文消息/.test(t); });
        if (hit) { hit.click(); return true; }
        var newBtn = document.querySelector('#js-add-btn') || document.querySelector('.weui-desktop-btn_new');
        if (newBtn) { newBtn.click(); return true; }
        return false;
      }
      var tryInsert = function () {
        attempts++;
        var ed = findEditor();
        if (ed) {
          // DOM 物理迁移（直接 appendChild，样式 100% 保留，不经过 HTML 清洗器）
          var r = insertStyledDom(ed, html, themeName);
          if (r.ok) {
            fillTitle(title);
            setTimeout(function () { clickPublish(); }, 800);
            return;
          }
          // DOM 插入失败 → 下策：execCommand insertHTML（可能样式被吃，但比发不出去好）
          try {
            ed.focus();
            while (ed.firstChild) ed.removeChild(ed.firstChild);
            var okFallback = document.execCommand('insertHTML', false, html);
            if (okFallback) {
              fillTitle(title);
              setTimeout(function () { clickPublish(); }, 800);
              notify('⚠️ 自动插入可能样式丢失，请到编辑器确认后再发表。');
              return;
            }
          } catch (e_fb) { /* ignore */ }
          if (attempts >= maxAttempts) {
            notify('定时已到：自动插入失败，请手动回到编辑器，点「插入编辑器」再发表。');
            return;
          }
        } else {
          if (!openedEditor) openedEditor = tryOpenEditor();
          if (attempts >= maxAttempts) { notify('定时已到：未找到编辑器，请手动新建图文后点「插入编辑器」。'); return; }
        }
        setTimeout(tryInsert, 2500);
      };
      setTimeout(tryInsert, 1500);
    }

    function fillTitle(title) {
      var inp = document.querySelector('input[placeholder*="标题"]') || document.querySelector('#title');
      if (inp && !inp.value) { inp.value = title; inp.dispatchEvent(new Event('input', { bubbles: true })); }
    }
    function clickPublish() {
      var btns = Array.prototype.slice.call(document.querySelectorAll('button, a'));
      var hit = btns.find(function (b) { var t = (b.textContent || '').trim(); return /发表|保存并群发|群发/.test(t); });
      if (hit) { hit.click(); notify('已自动点击「' + (hit.textContent || '').trim() + '」，请确认。'); }
      else notify('内容已填入，请手动点击发表。');
    }
    function notify(text) { try { chrome.runtime.sendMessage({ type: 'notify', text: text }); } catch (e) {} status(text); }

    renderList();
    console.log('[瑾之笺] 业务初始化完成 ✓');
  }

  waitForDeps(30);
})();