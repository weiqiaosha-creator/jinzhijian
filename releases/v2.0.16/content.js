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
  // 打印时隐藏插件界面，避免出现在打印预览/导出结果中遮挡内容
  var jzPrintCss = document.createElement('style');
  jzPrintCss.textContent = '@media print{#jz-panel,#jz-panel *{display:none!important}body>#jz-panel{display:none!important}}';
  (document.head || document.documentElement).appendChild(jzPrintCss);
  panel.innerHTML =
    '<div id="jz-head" style="padding:10px 14px;border-bottom:1px solid #eef1f5;font-weight:700;color:#00A86B;display:flex;justify-content:space-between;align-items:center;cursor:move;">瑾之笺 <span id="jz-fold" style="font-size:16px;color:#8a93a0;cursor:pointer;user-select:none;" title="折叠/展开">—</span></div>' +
    '<div id="jz-body" style="padding:12px 14px;display:flex;flex-direction:column;gap:10px;">' +
    '<div id="jz-drop" style="border:2px dashed #c4ccd6;border-radius:8px;padding:16px;text-align:center;color:#8a93a0;cursor:pointer;">拖入 .md/.docx/.pptx<br><span style="font-size:11px;">.doc 转 .docx；支持 GIF</span></div>' +
    '<input id="jz-file" type="file" multiple accept=".md,.markdown,.txt,.docx,.pptx,.doc,.gif" style="display:none;">' +
    '<button id="jz-capture" style="width:100%;padding:8px;border:none;border-radius:7px;background:#f0f2f5;color:#2b3a4a;font-weight:600;cursor:pointer;font-size:12px;border:1px solid #e3e6ea;">🔍 抓取当前公众号文章</button>' +
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
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
    '<button id="jz-export-html" style="flex:1;min-width:30%;padding:7px 6px;border:1px solid #e3e6ea;border-radius:7px;background:#fafbfc;color:#2b3a4a;font-weight:600;cursor:pointer;font-size:12px;">📄 导出 HTML</button>' +
    '<button id="jz-export-pdf" style="flex:1;min-width:30%;padding:7px 6px;border:1px solid #e3e6ea;border-radius:7px;background:#fafbfc;color:#2b3a4a;font-weight:600;cursor:pointer;font-size:12px;">🖨️ 导出 PDF</button>' +
    '<button id="jz-export-md" style="flex:1;min-width:30%;padding:7px 6px;border:1px solid #e3e6ea;border-radius:7px;background:#fafbfc;color:#2b3a4a;font-weight:600;cursor:pointer;font-size:12px;">📝 导出 MD</button>' +
    '<button id="jz-export-docx" style="flex:1;min-width:46%;padding:7px 6px;border:1px solid #e3e6ea;border-radius:7px;background:#fafbfc;color:#2b3a4a;font-weight:600;cursor:pointer;font-size:12px;">📃 导出 Word（DOCX）</button>' +
    '</div>' +
    '<div id="jz-diagnose" style="font-size:11px;padding:6px 8px;border-radius:5px;background:#f0f2f5;color:#555;margin-top:4px;line-height:1.5;"></div>' +
    '<div id="jz-status" style="font-size:12px;min-height:16px;"></div>' +
    '<details id="jz-imgwrap" style="font-size:12px;color:#8a93a0;display:none;"><summary style="cursor:pointer;color:#667eea;font-weight:600;margin-bottom:4px;">📷 图片证据表</summary><div id="jz-imgtable" style="max-height:140px;overflow:auto;"></div></details>' +
    '<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;"><span style="color:#8a93a0;font-weight:600;">📋 文件列表</span>' +
    '<button id="jz-clear-list" title="清空当前文件和已抓取内容" style="border:none;background:none;color:#c92a2a;font-size:12px;cursor:pointer;padding:0 4px;">🗑 清空</button></div>' +
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
      Array.prototype.forEach.call(list, function (f) {
        var ext = (f.name || '').split('.').pop().toLowerCase();
        var item = { file: f, html: '', error: '', kind: ext, rawText: null };
        // 对于md/txt文件，立即读取原始文本内容用于导出
        if (ext === 'md' || ext === 'markdown' || ext === 'txt') {
          f.text().then(function (t) { item.rawText = t; }).catch(function () {});
        }
        files.push(item);
      });
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
        // Step 4: 自动同步标题到公众号文章的标题框（标题为空时才填充，绝不覆盖手写标题）
        try { syncArticleTitle(wrap); } catch (e_t) {}
        // 调试用（用户不可见，方便以后控制台检查）
        try { window.__jianzhiDebug = { wrap: wrap, name: name, editor: ed }; } catch (e_w) {}
        return { ok: true };
      } catch (e_ins) {
        return { ok: false, reason: 'insert-fail' };
      }
    }

    // ==== 🎯 标题自动同步：插入后把文章标题填入公众号的标题框 ====
    // 标题来源优先级：输入框已有值 > 面板 #jz-title（下载/抓取给出的文档名）
    //               > 插入 DOM 中第一个 <h1> 的文本。
    // 仅在标题框为空时填充，绝不覆盖用户手写的标题。
    function syncArticleTitle(wrap) {
      var t = '';
      try {
        var tl = panel.querySelector('#jz-title');
        if (tl && tl.value) t = tl.value;
      } catch (e0) {}
      if (!t && wrap) {
        var h = wrap.querySelector('h1');
        if (h) t = (h.textContent || '').replace(/\s+/g, ' ').trim();
      }
      if (t) fillTitle(t);
    }

    function fillTitle(title) {
      if (!title) return;
      var input = null;
      var cand = [
        'input[placeholder*="标题"]',
        'input[placeholder*="文章标题"]',
        '#title',
        '.js_title_input',
        'input.title-input',
        '#mp-editor-toolbar input[placeholder]'
      ];
      for (var i = 0; i < cand.length && !input; i++) {
        try { input = document.querySelector(cand[i]); } catch (e_s) { input = null; }
      }
      if (input && !input.value) {
        input.value = title;
        try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch (e_ev) {}
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

    // ==== ⬇️ 导出（HTML / PDF）：复用同一套 containerCss + combined() 渲染 ====
    function currentContainerCss() {
      var theme = getTheme(themeName);
      var css = '';
      if (window.QSConverter && theme.container) {
        for (var k in theme.container) {
          if (!Object.prototype.hasOwnProperty.call(theme.container, k)) continue;
          if (k === 'macStyle') continue;
          css += k + ':' + theme.container[k] + ';';
        }
      }
      return css || 'padding:20px;line-height:1.75;font-size:15px;word-break:break-word;';
    }
    function safeFileName(s) {
      s = String(s == null ? '' : s).replace(/[\\/:*?"<>|\r\n\t]/g, '').trim();
      return s || '未命名文章';
    }
    function exportFullHtml() {
      var html = combined(); if (!html) { status('没有可导出的内容。', true); return null; }
      var baseName = safeFileName(panel.querySelector('#jz-title').value || (files[0] && files[0].title) || '未命名文章');
      return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
        '<meta name="generator" content="瑾之笺">' +
        '<title>' + escapeHtml(baseName) + '</title>' +
        '<style>@page{margin:16mm 14mm;}html,body{margin:0;padding:0;background:#fff;}*{box-sizing:border-box}body{font-size:14px;line-height:1.75;color:#333;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;}' +
        'body>#jz-export-main{max-width:820px;margin:0 auto;padding:24px 16px;overflow-wrap:break-word;word-break:break-word;text-align:left;}' +
        'img{max-width:100%;height:auto;}table{max-width:100%;border-collapse:collapse;margin:8px 0;}td,th{border:1px solid #ddd;padding:6px 8px;}' +
        'blockquote{margin:10px 0;padding-left:14px;border-left:4px solid #e3e6ea;color:#555;}pre{white-space:pre-wrap;word-break:break-word;background:#f6f8fa;padding:10px;border-radius:6px;}</style>' +
        '</head><body><div id="jz-export-main">' + html + '</div></body></html>';
    }
    function downloadFile(content, filename, mime) {
      try {
        var blob = new Blob([content], { type: mime + ';charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
      } catch (e_dl) {
        console.error('[瑾之笺] 导出文件失败:', e_dl);
        status('导出失败：' + (e_dl && e_dl.message || e_dl), true);
      }
    }

    panel.querySelector('#jz-export-html').onclick = function () {
      var full = exportFullHtml(); if (!full) return;
      var themeLabel = (themeSel.options[themeSel.selectedIndex] || {}).textContent || themeName;
      var baseName = safeFileName(panel.querySelector('#jz-title').value || (files[0] && files[0].title) || '未命名文章');
      var filename = baseName + '-' + themeLabel + '.html';
      downloadFile(full, filename, 'text/html');
      toast('📄 已导出：' + filename, '#00A86B');
      status('已导出 HTML：' + filename);
    };

    panel.querySelector('#jz-export-pdf').onclick = function () {
      var full = exportFullHtml(); if (!full) return;
      var themeLabel = (themeSel.options[themeSel.selectedIndex] || {}).textContent || themeName;
      var baseName = safeFileName(panel.querySelector('#jz-title').value || (files[0] && files[0].title) || '未命名文章');
      var filename = baseName + '-' + themeLabel + '.pdf';
      var w = window.open('', 'jz_pdf_export', 'width=768,height=900,scrollbars=yes,menubar=no,toolbar=no,location=no');
      if (!w) {
        toast('⚠️ 浏览器拦截了导出弹窗', '#d9480f');
        status('浏览器拦截了弹出窗口。请在地址栏右侧点「已阻止的弹出内容」，允许弹窗后重试。', true);
        return;
      }
      try {
        w.document.open(); w.document.write(full); w.document.close();
        w.document.title = baseName + '-' + themeLabel;
      } catch (e_doc2) {
        var dataUrl2 = 'data:text/html;charset=utf-8,' + encodeURIComponent(full);
        try { w.location.href = dataUrl2; } catch (_) {}
      }
      w.addEventListener('load', function () {
        setTimeout(function () {
          try { w.focus(); w.print(); }
          catch (e_pr) { console.warn('[瑾之笺] PDF 打印调用失败:', e_pr); }
        }, 300);
      });
      toast('🖨️ 已在打印对话框打开。请取消勾选「页眉和页脚」，再「另存为 PDF」', '#667eea');
          status('已打开打印预览，请关闭左侧「页眉和页脚」并选「另存为 PDF」：' + filename);
    };

    // ==== HTML → Markdown 转换（用于非MD文件导出） ====
    function htmlToMarkdown(html) {
      if (!html) return '';
      var div = document.createElement('div');
      div.innerHTML = html;
      
      function getText(el) {
        return (el.textContent || '').trim();
      }
      
      var md = '';
      var children = div.children;
      for (var i = 0; i < children.length; i++) {
        var el = children[i];
        var tag = el.tagName.toLowerCase();
        var text = getText(el);
        
        if (!text && tag !== 'img') continue;
        
        switch (tag) {
          case 'h1': md += '# ' + text + '\n\n'; break;
          case 'h2': md += '## ' + text + '\n\n'; break;
          case 'h3': md += '### ' + text + '\n\n'; break;
          case 'h4': md += '#### ' + text + '\n\n'; break;
          case 'h5': md += '##### ' + text + '\n\n'; break;
          case 'h6': md += '###### ' + text + '\n\n'; break;
          case 'p':
          case 'div':
          case 'section':
          case 'article':
          case 'blockquote':
            // 递归处理子元素
            var innerHtml = el.innerHTML;
            if (innerHtml.indexOf('<') >= 0) {
              md += htmlToMarkdown(innerHtml) + '\n\n';
            } else {
              md += text + '\n\n';
            }
            break;
          case 'ul':
            var lis = el.children;
            for (var j = 0; j < lis.length; j++) {
              if (lis[j].tagName.toLowerCase() === 'li') {
                md += '- ' + getText(lis[j]) + '\n';
              }
            }
            md += '\n';
            break;
          case 'ol':
            var lis2 = el.children;
            for (var k = 0; k < lis2.length; k++) {
              if (lis2[k].tagName.toLowerCase() === 'li') {
                md += (k + 1) + '. ' + getText(lis2[k]) + '\n';
              }
            }
            md += '\n';
            break;
          case 'img':
            var src = el.getAttribute('src') || '';
            var alt = el.getAttribute('alt') || '';
            // 跳过内嵌的base64图片（太大）
            if (src.indexOf('data:') === 0) {
              md += '![' + alt + '](图片已内嵌，请查看原文件)\n\n';
            } else {
              md += '![' + alt + '](' + src + ')\n\n';
            }
            break;
          case 'pre':
          case 'code':
            md += '```\n' + text + '\n```\n\n';
            break;
          case 'strong':
          case 'b':
            md += '**' + text + '**';
            break;
          case 'em':
          case 'i':
            md += '*' + text + '*';
            break;
          case 'a':
            var href = el.getAttribute('href') || '';
            md += '[' + text + '](' + href + ')';
            break;
          case 'br':
            md += '\n';
            break;
          case 'hr':
            md += '---\n\n';
            break;
          default:
            md += text + '\n\n';
        }
      }
      return md;
    }

    // ==== 导出 Markdown ====
    panel.querySelector('#jz-export-md').onclick = function () {
      if (!files.length) { status('没有可导出的内容。请先拖入文件。', true); return; }
      
      var baseName = safeFileName(panel.querySelector('#jz-title').value || (files[0] && files[0].title) || '未命名文章');
      var mdContent = '';
      var hasContent = false;
      
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        if (!f.html && !f.rawText) continue;
        
        // 优先使用原始Markdown文本（对于.md文件）
        if (f.rawText) {
          mdContent += f.rawText + '\n\n';
          hasContent = true;
        } else if (f.html) {
          // 对于其他格式，转换HTML为Markdown
          var md = htmlToMarkdown(f.html);
          if (f.title) mdContent += '# ' + f.title + '\n\n';
          mdContent += md + '\n';
          hasContent = true;
        }
      }
      
      if (!hasContent) { status('没有可导出的内容。', true); return; }
      
      // 添加元信息头
      var header = '---\n';
      header += 'title: "' + escapeHtml(baseName) + '"\n';
      header += 'exported_by: "瑾之笺"\n';
      header += 'exported_at: "' + new Date().toISOString() + '"\n';
      header += '---\n\n';
      
      var fullMd = header + mdContent;
      var filename = baseName + '.md';
      
      downloadFile(fullMd, filename, 'text/markdown');
      toast('📝 已导出：' + filename, '#00A86B');
      status('已导出 Markdown：' + filename + '（' + (files.length) + ' 个文件）');
    };

    // ==== DOCX 生成：复用已有 JSZip + MHTML altChunk（Word 2007+ 原生支持），图片完全 base64 内嵌 ====
    // 说明：MS Word 对 altChunk 的要求是使用 MHTML(.mht) 而不是 plain HTML；把外链图片 base64 内嵌到 MHT，
    // Word 打开时不会尝试联网下载（也就不会因防盗链/图片下载不到而无响应）。
    function base64EncodeUint8(u8) {
      var CHUNK = 0x8000; var out = '';
      for (var i = 0; i < u8.length; i += CHUNK) {
        var slice = u8.subarray(i, i + CHUNK);
        try { out += String.fromCharCode.apply(null, Array.prototype.slice.call(slice)); } catch (_e) {
          // 超大片段 apply 报错时，逐个字符
          var s = '';
          for (var k = 0; k < slice.length; k++) s += String.fromCharCode(slice[k]);
          out += s;
        }
      }
      return btoa(out);
    }
    function fetchImageToDataUrl(src) {
      // 走扩展 background（有 host_permissions，不受页面 CORS 限制）抓取微信图库图片。
      // 返回 Uint8Array（传输高效、不截断），在 content 里统一编码为 data:image/...;base64,...
      return new Promise(function (resolve) {
        var done = false;
        function doneOnce(v) { if (!done) { done = true; resolve(v); } }
        try {
          if (window.chrome && chrome.runtime && chrome.runtime.sendMessage) {
            try {
              chrome.runtime.sendMessage({ type: 'fetch-image', url: src }, function (resp) {
                if (!done && resp && resp.ok) {
                  var mime = resp.mime || 'image/jpeg';
                  // 1. 优先走 Uint8Array（Chrome MV3 原生支持、超长图不截断）
                  if (resp.bytes && (resp.bytes instanceof Uint8Array || (resp.bytes.buffer && resp.bytes.byteLength != null))) {
                    var u8 = (resp.bytes instanceof Uint8Array) ? resp.bytes : new Uint8Array(resp.bytes);
                    var b64 = '';
                    try { b64 = _u8ToB64(u8); } catch (_encErr) {}
                    if (b64) { doneOnce('data:' + mime + ';base64,' + b64); return; }
                  }
                  // 2. 兜底：返回的是 base64 字符串
                  if (resp.data && typeof resp.data === 'string') {
                    var clean = resp.data.replace(/[^A-Za-z0-9+/=]/g, '');
                    var pad2 = (4 - (clean.length % 4)) % 4;
                    if (pad2) clean += '==='.slice(0, pad2);
                    doneOnce('data:' + mime + ';base64,' + clean);
                    return;
                  }
                }
                // 3. background 失败：退回 canvas（适用于放行 CORS 的同域图）
                canvasImage(src, doneOnce);
              });
              setTimeout(function () { if (!done) canvasImage(src, doneOnce); }, 4000);
              return;
            } catch (_eb) { /* 消息发送失败走 canvas */ }
          }
        } catch (_ex) {}
        canvasImage(src, doneOnce);
      });
    }
    function _u8ToB64(u8) {
      // 手工 base64：避免超长字符串经 background 转义/截断导致 atob 失败。
      var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      var out = ''; var i = 0; var n = u8.length;
      while (i < n) {
        var b1 = u8[i++];
        var b2 = i < n ? u8[i++] : NaN;
        var b3 = i < n ? u8[i++] : NaN;
        var e1 = b1 >> 2;
        var e2 = ((b1 & 3) << 4) | (isNaN(b2) ? 0 : ((b2 >> 4) & 0x0F));
        var e3;
        if (isNaN(b2)) e3 = 64; else e3 = (((b2 & 0x0F) << 2) | (isNaN(b3) ? 0 : ((b3 >> 6) & 0x03)));
        var e4 = isNaN(b3) ? 64 : (b3 & 0x3F);
        out += chars.charAt(e1) + chars.charAt(e2) + (e3 === 64 ? '=' : chars.charAt(e3)) + (e4 === 64 ? '=' : chars.charAt(e4));
      }
      return out;
    }
    function canvasImage(src, doneOnce) {
      // 页面内 canvas 方案：仅在图片可被 canvas 读取时有效（多为同域或放行 CORS 的图）
      var fired = false;
      function fire(v) { if (!fired) { fired = true; doneOnce(v); } }
      try {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
          try {
            var c = document.createElement('canvas');
            var w = Math.max(1, img.naturalWidth || img.width);
            var h = Math.max(1, img.naturalHeight || img.height);
            c.width = w; c.height = h;
            var ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            fire(c.toDataURL('image/png'));
            return;
          } catch (_e1) { /* tainted */ }
          fire(null);
        };
        img.onerror = function () { fire(null); };
        setTimeout(function () { fire(null); }, 3000);
        img.src = src;
      } catch (_ex2) { fire(null); }
    }
    function inlineImagesInHtml(html) {
      return new Promise(function (resolve) {
        var tmp = document.createElement('div');
        tmp.innerHTML = html;
        var imgs = tmp.querySelectorAll('img[src]');
        if (!imgs.length) { resolve(tmp.innerHTML); return; }
        var pending = 0; var finished = 0;
        function check() { if (finished >= pending) resolve(tmp.innerHTML); }
        var srcs = [];
        for (var i = 0; i < imgs.length; i++) {
          var im = imgs[i];
          var s = im.getAttribute('src') || '';
          if (s.indexOf('data:') === 0) {
            // 已是 data url：解析真实宽高并写入 data-w/data-h 供 OOXML 计算尺寸
            probeSizeAndAttach(im, s);
            continue;
          }
          if (!/^(https?:)?\/\//i.test(s)) continue;
          pending++; srcs.push({ el: im, src: s });
        }
        if (!pending) { resolve(tmp.innerHTML); return; }
        for (var j = 0; j < srcs.length; j++) {
          (function (it) {
            fetchImageToDataUrl(it.src).then(function (d) {
              try {
                if (d) {
                  it.el.setAttribute('src', d);
                  probeSizeAndAttach(it.el, d);
                }
              } catch (_) {}
              finished++; check();
            });
          })(srcs[j]);
        }
        function probeSizeAndAttach(el, dataUrl) {
          try {
            var probe = new Image();
            var settled = false;
            function done(w, h) {
              if (settled) return; settled = true;
              if (w && h && w > 0 && h > 0) {
                el.setAttribute('data-w', String(w));
                el.setAttribute('data-h', String(h));
              }
            }
            probe.onload = function () { done(probe.naturalWidth || probe.width, probe.naturalHeight || probe.height); };
            probe.onerror = function () { done(0, 0); };
            setTimeout(function () { done(0, 0); }, 2500);
            probe.src = dataUrl;
          } catch (_) {}
        }
        // 总体兜底超时
        setTimeout(function () { resolve(tmp.innerHTML); }, 60000);
      });
    }
    // [已废弃] 旧 altChunk/MHT 实现已被下方 makeDocxOOXML（标准 OOXML）取代，删除以免残留失效代码。
    function makeDocxBlob(innerHtml, docTitle) {
      console.warn('[瑾之笺] 已改用 makeDocxOOXML，旧 MHT 实现不再使用。');
      return makeDocxOOXML(innerHtml, docTitle);
    }

    // ==== 标准 OOXML DOCX 生成（抛弃 altChunk/MHT）：Word 与 WPS 均原生支持 ====
    // 图像转成 word/media/* 真实部件并用 drawingML 引用，避免微信防盗链和无图问题。
    function escapeXml(s) {
      return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    }
    function b64ToUint8(b64) {
      // 容错解码：过滤非 base64 字符，避免 atob 因换行/空格/runtime base64 padding 问题导致 decode 失败。
      var raw = String(b64 || '').replace(/[^A-Za-z0-9+/=]/g, '');
      var pad = (4 - (raw.length % 4)) % 4;
      if (pad) raw += '==='.slice(0, pad);
      var bin = '';
      try {
        bin = atob(raw);
      } catch (_e) {
        // atob 仍失败时：手工解码 base64，保证不崩溃。
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        var out = new Uint8Array(Math.floor((raw.length * 3) / 4));
        var pos = 0;
        for (var i2 = 0; i2 < raw.length; i2 += 4) {
          var h1 = chars.indexOf(raw.charAt(i2));
          var h2 = chars.indexOf(raw.charAt(i2 + 1));
          var h3 = chars.indexOf(raw.charAt(i2 + 2));
          var h4 = chars.indexOf(raw.charAt(i2 + 3));
          if (h1 < 0 || h2 < 0) continue;
          var b1 = (h1 << 2) | (h2 >> 4);
          out[pos++] = b1 & 0xff;
          if (h3 >= 0 && raw.charAt(i2 + 2) !== '=') {
            var b2 = ((h2 & 15) << 4) | (h3 >> 2);
            out[pos++] = b2 & 0xff;
            if (h4 >= 0 && raw.charAt(i2 + 3) !== '=') {
              var b3 = ((h3 & 3) << 6) | h4;
              out[pos++] = b3 & 0xff;
            }
          }
        }
        return out.subarray(0, pos);
      }
      var u = new Uint8Array(bin.length);
      for (var j = 0; j < bin.length; j++) u[j] = bin.charCodeAt(j);
      return u;
    }
    function ooxmlRunRPr(fmt) {
      var p = '';
      if (fmt && fmt.b) p += '<w:b/>';
      if (fmt && fmt.i) p += '<w:i/>';
      if (fmt && fmt.u) p += '<w:u w:val="single"/>';
      if (fmt && fmt.font && fmt.font !== '') p += '<w:rFonts w:ascii="' + fmt.font + '" w:eastAsia="' + fmt.font + '" w:hAnsi="' + fmt.font + '"/>';
      return p ? '<w:rPr>' + p + '</w:rPr>' : '';
    }
    // 行内/块级 <img> → 单个 w:drawing（data: URL → word/media 部件）。
    // inlineImagesInHtml 已把所有 src 换成 data: URL，并写入 data-w/data-h 真实尺寸。
    // mediaRels 为共享数组，每次调用登记一个媒体条目，供打包阶段生成 media 部件与 rel。
    function ooxmlImage(img, mediaRels) {
      try {
        var src = img.getAttribute('src') || img.getAttribute('data-src') || '';
        var m = /^data:([^;,]+);base64,(.+)$/i.exec(src);
        if (!m) return ''; // 无有效内嵌数据则跳过（该图不产出）
        var mime = String(m[1]).toLowerCase();
        var b64 = m[2];
        if (!b64) return '';
        var ext = (mime.split('/')[1] || 'png').toLowerCase();
        if (ext === 'jpeg' || ext === 'jpe') ext = 'jpg';
        var relId = 'rIdImg' + (mediaRels.length + 1);
        mediaRels.push({ id: relId, ext: ext, mime: mime, b64: b64, url: src });
        // 照片完整落在 A4 可用区内（EMU 单位：1英寸=914400 EMU）
        // sectPr 定义：A4 pgSz=11906twips×16838twips≈8.27×11.69英寸，左右边距各1440twips=1英寸
        // 可用正文 ≈ 6.27英寸宽 × 9.69英寸高。取保守安全值：宽6英寸 / 高8英寸。
        var natW = parseInt(img.getAttribute('data-w') || '0', 10) || 0;
        var natH = parseInt(img.getAttribute('data-h') || '0', 10) || 0;
        var wpx = natW > 0 ? natW : 600;
        var hpx = natH > 0 ? natH : 450;
        var cx = Math.max(1, Math.round(wpx * 914400 / 96));
        var cy = Math.max(1, Math.round(hpx * 914400 / 96));
        var MAX_W_EMU = 5486400; // 6 英寸（页面可用宽 6.27 英寸留 0.27 英寸安全余度）
        var MAX_H_EMU = 7315200; // 8 英寸（页面可用高 9.69 英寸留 1.7 英寸安全余度）
        if (cx > MAX_W_EMU) {
          var _rw = MAX_W_EMU / cx;
          cx = MAX_W_EMU;
          cy = Math.max(1, Math.round(cy * _rw));
        }
        if (cy > MAX_H_EMU) {
          var _rh = MAX_H_EMU / cy;
          cy = MAX_H_EMU;
          cx = Math.max(1, Math.round(cx * _rh));
        }
        var idN = 2048 + mediaRels.length;
        return '<w:r><w:drawing>' +
          '<wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0">' +
          '<wp:extent cx="' + cx + '" cy="' + cy + '"/>' +
          '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
          '<wp:docPr id="' + idN + '" name="Picture ' + idN + '"/>' +
          '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
          '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
          '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
          '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
          '<pic:nvPicPr><pic:cNvPr id="' + idN + '" name="Picture ' + idN + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
          '<pic:blipFill><a:blip r:embed="' + relId + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
          '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
          '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
          '</pic:pic>' +
          '</a:graphicData></a:graphic>' +
          '</wp:inline></w:drawing></w:r>';
      } catch (_eimg) { return ''; }
    }
    // 内联节点序列 → 一组 w:r（仅处理文字、加粗/斜体/下划线、br、行内图片）
    function ooxmlInlineList(children, mediaRels, fmt) {
      var xml = '';
      for (var i = 0; i < children.length; i++) {
        var n = children[i];
        if (n.nodeType === 3) {
          var t = n.nodeValue; if (t == null) continue;
          if (t.length === 0) continue;
          xml += '<w:r>' + ooxmlRunRPr(fmt) + '<w:t xml:space="preserve">' + escapeXml(t) + '</w:t></w:r>';
        } else if (n.nodeType === 1) {
          var tag = n.tagName.toLowerCase();
          if (tag === 'b' || tag === 'strong') xml += ooxmlInlineList(n.childNodes, mediaRels, { b: true, i: fmt.i, u: fmt.u, font: fmt.font });
          else if (tag === 'i' || tag === 'em') xml += ooxmlInlineList(n.childNodes, mediaRels, { b: fmt.b, i: true, u: fmt.u, font: fmt.font });
          else if (tag === 'u') xml += ooxmlInlineList(n.childNodes, mediaRels, { b: fmt.b, i: fmt.i, u: true, font: fmt.font });
          else if (tag === 'a') {
            // WPS/Word 超链接需要 Relationship；为保持开箱即用，这里把「文本 + 链接地址」都打出来，无外部依赖
            var txt = ooxmlInlineList(n.childNodes, mediaRels, { b: fmt.b, i: true, u: true, font: fmt.font });
            var href = escapeXml(n.getAttribute('href') || '');
            xml += txt;
            if (href) {
              xml += '<w:r>' + ooxmlRunRPr({ font: fmt.font }) + '<w:t xml:space="preserve"> (' + href + ')</w:t></w:r>';
            }
          }
          else if (tag === 'code' || tag === 'tt') xml += ooxmlInlineList(n.childNodes, mediaRels, { b: fmt.b, i: fmt.i, u: fmt.u, font: 'Consolas' });
          else if (tag === 'br') xml += '<w:r>' + ooxmlRunRPr(fmt) + '<w:br/></w:r>';
          else if (tag === 'img') xml += ooxmlImage(n, mediaRels);
          else if (tag === 'span' || tag === 'font' || tag === 'label' || tag === 'small' || tag === 'big' || tag === 'sub' || tag === 'sup') {
            xml += ooxmlInlineList(n.childNodes, mediaRels, fmt);
          }
          else {
            // 其它内联容器：继续走其内联内容，避免嵌套 block 导致截断
            xml += ooxmlInlineList(n.childNodes, mediaRels, fmt);
          }
        }
      }
      return xml;
    }
    function ooxmlParagraph(node, mediaRels, alignLeft) {
      var runs = ooxmlInlineList(node.childNodes, mediaRels, {});
      // 空段落保持换行，不直接丢弃
      var pPr = '<w:pPr>';
      if (alignLeft) pPr += '';
      else pPr += '';
      pPr += '</w:pPr>';
      return '<w:p>' + pPr + runs + '</w:p>';
    }
    function ooxmlImageBlock(img, mediaRels) {
      // 块级路径：必须把 run 包进 <w:p>，否则在 body 里产生「孤儿 run」导致 Word 中断/判损坏
      var run = ooxmlImage(img, mediaRels);
      return run ? '<w:p>' + run + '</w:p>' : '';
    }
    function ooxmlBdr(pos) {
      return '<w:' + pos + ' w:val="single" w:sz="4" w:space="0" w:color="888888"/>';
    }
    function ooxmlTable(table, mediaRels) {
      var rows = table.querySelectorAll('tr');
      if (!rows.length) return '';
      var xml = '<w:tbl>' +
        '<w:tblPr>' +
        '<w:tblW w:w="5000" w:type="pct"/>' +
        '<w:tblBorders>' + ooxmlBdr('top') + ooxmlBdr('left') + ooxmlBdr('bottom') + ooxmlBdr('right') + ooxmlBdr('insideH') + ooxmlBdr('insideV') + '</w:tblBorders>' +
        '<w:tblLook w:val="04A0"/>' +
        '</w:tblPr>';
      for (var r = 0; r < rows.length; r++) {
        xml += '<w:tr>';
        var cells = rows[r].querySelectorAll('td,th');
        for (var c = 0; c < cells.length; c++) {
          var cell = cells[c];
          // 单元格内容：用 BLOCK 递归展开，能正确处理嵌套 p/img
          var cellXml = ooxmlBlocksFromNode(cell, mediaRels);
          if (!cellXml) cellXml = '<w:p/>';
          xml += '<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>' + cellXml + '</w:tc>';
        }
        xml += '</w:tr>';
      }
      xml += '</w:tbl><w:p/>';
      return xml;
    }
    // 核心：从节点出发，递归输出 BLOCK（段落/标题/列表/表格/图片/嵌套容器）。
    function ooxmlBlocksFromNode(root, mediaRels) {
      var out = '';
      var kids = root.childNodes;
      for (var i = 0; i < kids.length; i++) {
        var n = kids[i];
        if (n.nodeType === 3) {
          var tx = (n.nodeValue || '').replace(/[ \t\r\f\v]+/g, ' ');
          if (tx.trim().length === 0) continue;
          out += '<w:p><w:r><w:t xml:space="preserve">' + escapeXml(tx) + '</w:t></w:r></w:p>';
          continue;
        }
        if (n.nodeType !== 1) continue;
        var tag = n.tagName.toLowerCase();
        // ---- 真正的块级元素派发：递归 ----
        if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article' || tag === 'header' || tag === 'footer' || tag === 'aside' || tag === 'nav') {
          // 如果内部是纯内联（无嵌套块），直接作为段落；否则递归展开内部分块
          var hasBlockKid = false;
          for (var q = 0; q < n.children.length; q++) {
            var ck = n.children[q].tagName.toLowerCase();
            if (/^(p|div|section|article|h[1-6]|ul|ol|table|pre|blockquote|img)$/.test(ck)) { hasBlockKid = true; break; }
          }
          if (!hasBlockKid) out += ooxmlParagraph(n, mediaRels, true);
          else out += ooxmlBlocksFromNode(n, mediaRels);
        } else if (/^h[1-6]$/.test(tag)) {
          var lvl = parseInt(tag.charAt(1), 10);
          var sizes = [48, 40, 36, 32, 30, 28]; // 对应 h1..h6
          var sz = sizes[(lvl - 1)] || 28;
          var innerRuns = ooxmlInlineList(n.childNodes, mediaRels, { b: true });
          out += '<w:p><w:pPr><w:spacing w:before="200" w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="' + sz + '"/></w:rPr></w:r>' + innerRuns + '</w:p>';
        } else if (tag === 'ul' || tag === 'ol') {
          var ordered = (tag === 'ol');
          var seq = 0;
          var listKids = n.children;
          for (var li = 0; li < listKids.length; li++) {
            if (listKids[li].tagName.toLowerCase() !== 'li') continue;
            seq++;
            var mark = ordered ? (seq + '. ') : '• ';
            var liHasBlock = false;
            for (var lq = 0; lq < listKids[li].children.length; lq++) {
              var lck = listKids[li].children[lq].tagName.toLowerCase();
              if (/^(p|div|h[1-6]|ul|ol|table|pre|blockquote)$/.test(lck)) { liHasBlock = true; break; }
            }
            var itemBody;
            if (!liHasBlock) {
              itemBody = ooxmlInlineList(listKids[li].childNodes, mediaRels, {});
              out += '<w:p><w:pPr><w:ind w:left="360" w:hanging="0"/></w:pPr>' +
                '<w:r><w:t xml:space="preserve">' + escapeXml(mark) + '</w:t></w:r>' +
                itemBody + '</w:p>';
            } else {
              out += '<w:p><w:pPr><w:ind w:left="360"/></w:pPr>' +
                '<w:r><w:t xml:space="preserve">' + escapeXml(mark) + '</w:t></w:r></w:p>';
              out += ooxmlBlocksFromNode(listKids[li], mediaRels);
            }
          }
        } else if (tag === 'img') {
          out += ooxmlImageBlock(n, mediaRels);
        } else if (tag === 'table') {
          out += ooxmlTable(n, mediaRels);
        } else if (tag === 'blockquote') {
          out += '<w:p><w:pPr><w:ind w:left="420" w:right="360"/><w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="888888"/></w:pBdr><w:rPr><w:color w:val="555555"/></w:rPr></w:pPr></w:p>';
          out += ooxmlBlocksFromNode(n, mediaRels);
        } else if (tag === 'pre') {
          var lines = (n.textContent || '').replace(/\r/g, '').split('\n');
          for (var ln = 0; ln < lines.length; ln++) {
            var line = lines[ln];
            out += '<w:p><w:r><w:rPr><w:rFonts w:ascii="Consolas" w:eastAsia="Microsoft YaHei" w:hAnsi="Consolas"/></w:rPr><w:t xml:space="preserve">' +
              escapeXml(line) + '</w:t></w:r></w:p>';
          }
        } else if (tag === 'hr') {
          out += '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BBBBBB"/></w:pBdr></w:pPr></w:p>';
        } else if (tag === 'figure' || tag === 'figcaption' || tag === 'video' || tag === 'audio') {
          // figure 走递归（figcaption 作为段落，figure 包含的 img 走块级）
          out += ooxmlBlocksFromNode(n, mediaRels);
        } else if (tag === 'noscript' || tag === 'script' || tag === 'style' || tag === 'link' || tag === 'meta') {
          // 交互/非展示元素直接跳过
          continue;
        } else {
          // 其余未知元素：先尝试作为内联段落，如果内部含有块再递归块展开
          var inner = '';
          var anyBlockInside = false;
          for (var z = 0; z < n.children.length; z++) {
            var zk = n.children[z].tagName.toLowerCase();
            if (/^(p|div|section|article|h[1-6]|ul|ol|table|pre|blockquote|img|figure)$/.test(zk)) { anyBlockInside = true; break; }
          }
          if (anyBlockInside) {
            out += ooxmlBlocksFromNode(n, mediaRels);
          } else {
            inner = ooxmlInlineList(n.childNodes, mediaRels, {});
            if (inner) out += '<w:p>' + inner + '</w:p>';
          }
        }
      }
      return out;
    }
    function htmlToOoxmlBody(safeHtml, mediaRels) {
      var wrap = document.createElement('div');
      try { wrap.innerHTML = safeHtml; } catch (_e) { return ''; }
      return ooxmlBlocksFromNode(wrap, mediaRels);
    }
    // 从已经用户验证可用的「导出 HTML」完整文档里，取出正文内容（保证无 MD 原始标记、标题/段落/图片结构与 HTML 导出一致）。
    // 这是 DOCX 内容的权威来源，避免了使用 combined() 在模板失败时产生的 #标题# 这类 MD 残留。
    function getExportDocxBody() {
      var full = exportFullHtml(); if (!full) return '';
      try {
        var host = document.implementation.createHTMLDocument('');
        host.documentElement.innerHTML = full;
        var main = host.getElementById('jz-export-main');
        if (!main) return full; // 退化：取不到主容器就用完整串，保证不抛
        return main.innerHTML;
      } catch (_e) { return full; }
    }
    function makeDocxOOXML(innerHtml, docTitle) {
      // 1. 先图片全量 base64 内嵌（解决微信防盗链导致 Word/WPS 无图）
      return inlineImagesInHtml(innerHtml).then(function (safeHtml) {
        var mediaRels = [];
        var bodyXml = htmlToOoxmlBody(safeHtml, mediaRels);
        var title = escapeXml(String(docTitle || '未命名文章'));
        // 2. 组装 OOXML（先过滤损坏媒体 + 统一扩展名，避免 Word 判文件损坏）
        function normalizeExt(ext) {
          // WPS/Word 兼容：jpeg → jpg；其它别名统一为常见 OOXML 可识别扩展名
          var e = String(ext || 'png').toLowerCase().replace(/\./g, '');
          if (e === 'jpeg' || e === 'jpg' || e === 'jpe') return { ext: 'jpg',  mime: 'image/jpeg' };
          if (e === 'png') return { ext: 'png', mime: 'image/png' };
          if (e === 'gif') return { ext: 'gif', mime: 'image/gif' };
          if (e === 'bmp') return { ext: 'bmp', mime: 'image/bmp' };
          if (e === 'webp') return { ext: 'webp', mime: 'image/webp' };
          if (e === 'tif' || e === 'tiff') return { ext: 'tif', mime: 'image/tiff' };
          return { ext: 'png', mime: 'image/png' };
        }
        // 清洗并重新编号 mediaRels（跳过空内容、b64 损坏等无效图，统一扩展名，并同步替换 document.xml 中的 drawing 引用）
        var cleanRels = [];
        for (var _vi = 0; _vi < mediaRels.length; _vi++) {
          var oldEntry = mediaRels[_vi];
          if (!oldEntry || !oldEntry.b64) continue;
          var cleanB64 = String(oldEntry.b64).replace(/[^A-Za-z0-9+/=]/g, '');
          var pad = (4 - (cleanB64.length % 4)) % 4;
          if (pad) cleanB64 += '==='.slice(0, pad);
          if (cleanB64.length === 0) continue;
          var bytes;
          try { bytes = b64ToUint8(cleanB64); } catch (_vb) { continue; }
          if (!bytes || bytes.length < 16) continue; // 小于 16 字节视为无效图（可能是空白占位损坏）
          var norm = normalizeExt(oldEntry.ext);
          var newIdx = cleanRels.length + 1;
          var newId = 'rIdImg' + newIdx;
          cleanRels.push({
            oldId: oldEntry.id,
            newId: newId,
            target: newIdx + '.' + norm.ext,
            ext: norm.ext,
            mime: norm.mime,
            b64: cleanB64,
            bytes: bytes
          });
        }
        // 同步替换 bodyXml 里对 rIdImgN 的引用为新编号（如果因过滤导致跳号，仍能正确映射）
        for (var _vi2 = 0; _vi2 < cleanRels.length; _vi2++) {
          var _cr = cleanRels[_vi2];
          if (_cr.oldId && _cr.oldId !== _cr.newId) {
            try {
              var _re1 = new RegExp('r:embed="' + _cr.oldId.replace(/([.*+?^=!:${}()|[\]\/\\])/g, '\\$1') + '"', 'g');
              bodyXml = bodyXml.replace(_re1, 'r:embed="' + _cr.newId + '"');
              var _re2 = new RegExp('name="' + ('Image' + ((_cr.oldId || '').replace(/\D/g, ''))) + '"', 'g');
              bodyXml = bodyXml.replace(_re2, 'name="Image' + _cr.newIdx + '"');
              var _re3 = new RegExp('id="' + ((_cr.oldId || '').replace(/\D/g, '')) + '" name="Image' + ((_cr.oldId || '').replace(/\D/g, '')) + '"', 'g');
              bodyXml = bodyXml.replace(_re3, 'id="' + (2048 + _cr.newIdx) + '" name="Image' + _cr.newIdx + '"');
            } catch (_reerr) {}
          }
        }
        // Content_Types: 声明扩展名默认类型
        var contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>';
        var seenExt2 = {};
        for (var e3 = 0; e3 < cleanRels.length; e3++) {
          var ex3 = cleanRels[e3].ext;
          var mi3 = cleanRels[e3].mime;
          if (!seenExt2[ex3]) { seenExt2[ex3] = 1; contentTypes += '<Default Extension="' + ex3 + '" ContentType="' + mi3 + '"/>'; }
        }
        contentTypes += '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
          '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
          '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
          '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
          '</Types>';
        var rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
          '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
          '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
          '</Relationships>';
        var mainBodies = '';
        if (title) mainBodies += '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t xml:space="preserve">' + title + '</w:t></w:r></w:p><w:p/>';
        mainBodies += bodyXml;
        var documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
          mainBodies +
          '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>' +
          '</w:body></w:document>';
        var docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rIdStyle" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';
        for (var r3 = 0; r3 < cleanRels.length; r3++) {
          docRels += '<Relationship Id="' + cleanRels[r3].newId + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + cleanRels[r3].target + '"/>';
        }
        docRels += '</Relationships>';
        var stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
          '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Microsoft YaHei" w:eastAsia="Microsoft YaHei"/><w:sz w:val="28"/></w:rPr></w:style>' +
          '</w:styles>';
        var d = new Date(); var iso = d.toISOString();
        var coreXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
          '<dc:creator>瑾之笺</dc:creator><cp:lastModifiedBy>瑾之笺</cp:lastModifiedBy><dc:title>' + title + '</dc:title>' +
          '<dcterms:created xsi:type="dcterms:W3CDTF">' + iso + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + iso + '</dcterms:modified></cp:coreProperties>';
        var appXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>瑾之笺</Application></Properties>';
        // 3. 打包
        return new Promise(function (resolve, reject) {
          if (!window.JSZip) { reject(new Error('JSZip 未加载。')); return; }
          try {
            var zip = new window.JSZip();
            zip.file('[Content_Types].xml', contentTypes);
            zip.folder('_rels').file('.rels', rootRels);
            zip.folder('word').file('document.xml', documentXml);
            zip.folder('word').file('styles.xml', stylesXml);
            zip.folder('word/_rels').file('document.xml.rels', docRels);
            if (cleanRels.length) {
              var mediaFolder = zip.folder('word/media');
              for (var m3 = 0; m3 < cleanRels.length; m3++) {
                mediaFolder.file(cleanRels[m3].target, cleanRels[m3].bytes);
              }
            }
            zip.folder('docProps').file('core.xml', coreXml);
            zip.folder('docProps').file('app.xml', appXml);
            zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' })
              .then(function (blob) { resolve(blob); }).catch(function (e) { reject(e); });
          } catch (e_zip) { reject(e_zip); }
        });
      });
    }

    panel.querySelector('#jz-export-docx').onclick = function () {
      var full = exportFullHtml(); if (!full) return;
      var themeLabel = (themeSel.options[themeSel.selectedIndex] || {}).textContent || themeName;
      var baseName = safeFileName(panel.querySelector('#jz-title').value || (files[0] && files[0].title) || '未命名文章');
      var filename = baseName + '-' + themeLabel + '.docx';
      var body = getExportDocxBody(); if (!body) { status('没有可导出的正文内容。', true); return; }
      status('正在生成 Word（DOCX）… 正在内嵌图片并排版，图片多时请耐心等候。');
      makeDocxOOXML(body, baseName)
        .then(function (blob) {
          try {
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click();
            setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
            toast('📃 已导出：' + filename, '#00A86B');
            status('已导出 Word：' + filename + '（图片已完全内嵌，MS Word 可直接秒开不联网）');
          } catch (e_dl) {
            toast('❌ 下载失败：' + (e_dl && e_dl.message || e_dl), '#d9480f');
            status('导出 Word 失败：' + (e_dl && e_dl.message || e_dl), true);
          }
        })
        .catch(function (e_docx) {
          console.error('[瑾之笺] DOCX 导出失败:', e_docx);
          toast('❌ 导出 Word 失败：' + (e_docx && e_docx.message || e_docx), '#d9480f');
          status('导出 Word 失败：' + (e_docx && e_docx.message || e_docx), true);
        });
    };

    // ==== 抓取当前公众号文章 ====
    function findArticleContainer() {
      // 按优先级找微信文章正文容器
      var els = document.querySelectorAll('#js_content, #js_content_wrapper, .rich_media_content, .blog-article-content, .article-content');
      for (var i = 0; i < els.length; i++) {
        if (els[i] && els[i].children.length >= 2) return els[i];
      }
      return null;
    }
    function getArticleTitle() {
      var el = document.querySelector('#activity-name, .rich_media_title, .og-pages-title, h1.js_title');
      if (el) return (el.textContent || '').trim();
      return document.title.replace(/_微信公众号文章$/, '').replace(/[-_].*$/, '').trim() || '公众号文章';
    }
    function pickArticleImages(container) {
      var imgs = container.querySelectorAll('img');
      for (var j = 0; j < imgs.length; j++) {
        var im = imgs[j];
        // 微信懒加载图片：data-src 存真实地址，src 常是占位符
        var ori = (im.getAttribute('data-src') || '').trim();
        if (!ori) {
          // 部分极端情况用 data-original / src 延迟
          ori = (im.getAttribute('data-original') || '').trim();
        }
        var HTTP = /^(https?:)?\/\//i;
        if (HTTP.test(ori)) {
          var cur = im.getAttribute('src') || '';
          // 当前 src 为空、是 data: 占位（gif/svg/base64）或 file 占位 → 用真实地址
          var isPlaceholder = !cur || cur.indexOf('data:') === 0 || /^(https?:)?\/\//i.test(cur) === false;
          if (isPlaceholder) {
            try { im.setAttribute('src', ori); } catch (_) {}
          }
        }
        // 清掉懒加载钩子，避免后续被 SPA 改回占位
        try { im.removeAttribute('data-src'); im.removeAttribute('data-original'); } catch (_) {}
      }
    }
    function cleanupArticle(container) {
      // 移除样式/脚本/空元素，保留下方正文核心
      var css = container.querySelectorAll('script, style, .js_share_btn, .js_pc_qr_code, .js_readmore, .rich_media_area_title');
      for (var i = css.length - 1; i >= 0; i--) { try { css[i].parentNode && css[i].parentNode.removeChild(css[i]); } catch (_) {} }
      // 移除纯空节点
      var els = container.querySelectorAll('p, span, div, section');
      for (var k = els.length - 1; k >= 0; k--) {
        var e = els[k];
        if (e.children.length === 0 && !e.textContent.trim() && !e.innerHTML.trim()) {
          try { e.parentNode && e.parentNode.removeChild(e); } catch (_) {}
        }
      }
      return container.cloneNode(true);
    }
    // 抓取文章 → 保留段落结构与顺序的 Markdown 纯文本（不被折叠成单行）
    function articleToMarkdownText(root) {
      var clone = root.cloneNode(true);
      // 块级元素末尾追加空行，<br>替换为换行，保留段落划分
      var blocks = clone.querySelectorAll('p, div, section, article, h1, h2, h3, h4, h5, h6, li, blockquote, pre, tr');
      for (var i = 0; i < blocks.length; i++) {
        // 只在极致简单没有内联文本节点相邻的块末尾补换行，避免把 span 字打断
        blocks[i].appendChild(document.createTextNode('\n'));
        blocks[i].appendChild(document.createTextNode('\n'));
      }
      var brs = clone.querySelectorAll('br');
      for (var j = 0; j < brs.length; j++) {
        try { brs[j].parentNode.replaceChild(document.createTextNode('\n'), brs[j]); } catch (_) {}
      }
      // 表格 → Markdown 表格语法（微信文章里常见的 Excel 表格）
      var tables = clone.querySelectorAll('table');
      for (var t = 0; t < tables.length; t++) {
        var tbl = tables[t];
        var rows = tbl.querySelectorAll('tr');
        if (!rows.length) continue;
        var out = ['\n'];
        for (var r = 0; r < rows.length; r++) {
          var cells = rows[r].querySelectorAll('th, td');
          var line = '| ' + Array.prototype.map.call(cells, function (cell) {
            return (cell.textContent || '').replace(/[ \t\u3000]+/g, ' ').replace(/\s*\n\s*/g, ' ').trim();
          }).join(' | ') + ' |';
          out.push(line);
          if (r === 0) {
            // 分隔行：表头下一行加分隔符
            var sep = '|' + Array.prototype.map.call(cells, function () { return ' --- '; }).join('|') + '|';
            out.push(sep);
          }
        }
        out.push('\n');
        var holder = document.createElement('span');
        holder.textContent = out.join('\n');
        try { tbl.parentNode.replaceChild(holder, tbl); } catch (_) {}
      }
      // 图片 → Markdown 图片语法（让导出的 .md 保留图片引用，不含则删掉纯装饰图）
      var pics = clone.querySelectorAll('img');
      for (var p = 0; p < pics.length; p++) {
        var im = pics[p];
        var imgSrc = (im.getAttribute('src') || im.getAttribute('data-src') || '').trim();
        if (imgSrc) {
          var imgAlt = (im.getAttribute('alt') || '图片').replace(/[\[\(\)\n\r]/g, '').trim() || '图片';
          var imgHolder = document.createElement('span');
          imgHolder.textContent = '\n\n![' + imgAlt + '](' + imgSrc + ')\n\n';
          try { im.parentNode.replaceChild(imgHolder, im); } catch (_) {}
        } else {
          try { im.parentNode.removeChild(im); } catch (_) {}
        }
      }
      var text = (clone.textContent || '')
        .replace(/[ \t\u3000]+/g, ' ')       // 压缩行内多余空格，保留换行
        .replace(/ *([\r\n])+ */g, '$1')     // 清除换行旁的多余空格
        .replace(/\n{3,}/g, '\n\n')          // 多空行折叠为段落间隔
        .trim();
      return text;
    }

    panel.querySelector('#jz-capture').onclick = function () {
      try {
        // 抓文章前先清空旧列表（避免多份内容被一起导出——抓文章几乎都是单份需求）
        if (files.length) { files.length = 0; panel.querySelector('#jz-title').value = ''; }
        var container = findArticleContainer();
        if (!container) {
          toast('❌ 未识别到公众号文章正文', '#d9480f');
          status('未识别到当前页为公众号文章正文。请确认你正打开的是文章阅读页（mp.weixin.qq.com/s/...）。', true);
          return;
        }
        pickArticleImages(container);
        var clone = cleanupArticle(container);
        var html = clone.innerHTML || '';
        var rawText = articleToMarkdownText(clone);
        if (!html || !rawText) {
          toast('❌ 文章正文为空', '#d9480f');
          status('识别到正文容器但内容为空，无法抓取。', true);
          return;
        }
        var title = getArticleTitle();
        // 抓取内容以伪文件项加入列表（file 需有 name 供 renderList 显示）
        files.push({
          file: { name: title, title: title },
          html: html,
          rawText: rawText,
          title: title,
          kind: 'capture',
          captured: true
        });
        var titleEl = panel.querySelector('#jz-title');
        if (!titleEl.value) titleEl.value = title;
        renderList();
        toast('✅ 已抓取文章：' + title, '#00A86B');
        status('已抓取「' + title + '」，文本 ' + rawText.length + ' 字。可点击 导出HTML/PDF/MD。');
      } catch (e_cap) {
        console.error('[瑾之笺] 抓取文章异常:', e_cap);
        toast('❌ 抓取失败：' + (e_cap && e_cap.message || e_cap), '#d9480f');
        status('抓取异常：' + (e_cap && e_cap.message || e_cap), true);
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

    // ==== 清空文件/抓取列表 ====
    panel.querySelector('#jz-clear-list').onclick = function () {
      if (!files.length) { status('列表已是空的。', true); return; }
      files.length = 0;
      panel.querySelector('#jz-title').value = '';
      renderList();
      toast('🗑 已清空列表', '#00A86B');
      status('文件和抓取内容已清空。可重新拖入文件或抓取文章。');
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
