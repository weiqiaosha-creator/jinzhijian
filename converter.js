/*
 * converter.js — 多格式转微信公众号内联 HTML 核心转换器（瑾之笺）
 *
 * 【稳健性原则】本文件只用 ES5 兼容语法（严格避免：反向预查 lookbehind、
 * named capture groups、dotAll flag s、Unicode property escapes、let/const
 * template strings、async/await 等），以兼容 Edge、旧版 Chromium。
 *
 * 依赖（浏览器 UMD 全局，置于 libs/，许可证见 README）：
 *   window.markdownit  (markdown-it, MIT)
 *   window.mammoth     (mammoth.browser, BSD-2-Clause)
 *   window.JSZip       (jszip, MIT OR GPL-3.0，本产品依 MIT 使用)
 *   window.QSThemes    (themes.js，本仓库独立版权)
 */
(function (global) {
  'use strict';

  // ============================================================
  // 1) Markdown 语法白名单（参考 wechat-article-pipeline）
  //    不支持的语法命中即报错，避免默默渲染成错误样子。
  //    （绝对避免 ES2018 的 lookbehind）
  // ============================================================
  var UNSUPPORTED_RULES = [
    {
      name: '嵌套列表',
      // 以两个以上空格或 tab 开头，后面跟 - * + 加非空白
      re: /^(?:\s{2,}|\t)+[-*+]\s+\S/m,
      hint: '只支持单层列表，请改写成单层或分成多段'
    },
    {
      name: '四级及以下标题',
      re: /^#{4,}\s+\S/m,
      hint: '只支持一到三级标题'
    },
    {
      name: 'Markdown 中写 HTML 标签',
      re: /^\s*<(?!!--)[a-zA-Z][^>]*>/m,
      hint: '不支持在 Markdown 里直接写 HTML，请把 HTML 片段转成图片或纯文本'
    }
  ];
  // 行内图片：用「匹配」+「排除独占行」的逻辑代替 lookbehind
  var INLINE_IMG_RE = /!\[[^\]]*\]\([^)]+\)/g;
  var SOLO_IMG_LINE_RE = /^\s*!\[[^\]]*\]\([^)]+\)\s*$/;

  function validateMarkdown(md) {
    var lines = (md || '').split('\n');
    var issues = [];
    for (var r = 0; r < UNSUPPORTED_RULES.length; r++) {
      var rule = UNSUPPORTED_RULES[r];
      for (var i = 0; i < lines.length; i++) {
        if (rule.re.test(lines[i])) {
          issues.push({ line: i + 1, name: rule.name, text: lines[i].trim(), hint: rule.hint });
          if (issues.length >= 5) break;
        }
      }
      if (issues.length >= 5) break;
    }
    // 单独检测行内图片（不能独占一行，且包含图片语法）
    if (issues.length < 5) {
      for (var j = 0; j < lines.length; j++) {
        var line = lines[j];
        INLINE_IMG_RE.lastIndex = 0;
        if (INLINE_IMG_RE.test(line) && !SOLO_IMG_LINE_RE.test(line)) {
          issues.push({ line: j + 1, name: '行内图片', text: line.trim(), hint: '图片必须独占一行，不能夹在句子中间' });
          if (issues.length >= 5) break;
        }
      }
    }
    return issues;
  }

  // ============================================================
  // 2) 图片证据表（参考 wechat-article-pipeline）
  //    列出每张图的序号、alt、src、是否 base64 内嵌
  // ============================================================
  function extractImageList(html) {
    var result = [];
    if (!html) return result;
    var div = document.createElement('div');
    div.innerHTML = html;
    var imgs = div.getElementsByTagName('img');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      var src = img.getAttribute('src') || '';
      var displaySrc = src.length > 80 ? src.substring(0, 80) + '\u2026' : src;
      result.push({
        index: i + 1,
        alt: img.getAttribute('alt') || '',
        src: displaySrc,
        isDataUri: src.indexOf('data:') === 0,
        width: img.style.width || ''
      });
    }
    return result;
  }

  // ============================================================
  // 3) 推送前安全检查（扫描 AppSecret / Token / 本地路径泄露等）
  //    完全避免 lookbehind，保守匹配
  // ============================================================
  var HIGH_RISK = [
    { name: 'AppSecret 暴露', re: /(APPSECRET|APP_SECRET)[\s:=]*[A-Za-z0-9]{8,}/i },
    { name: '微信 Token 暴露', re: /(ACCESS_TOKEN|WX_TOKEN|WECHAT_TOKEN)[\s:=]*[A-Za-z0-9]{10,}/i },
    { name: 'OpenAI API Key', re: /\bsk-(proj-)?[A-Za-z0-9_-]{16,}\b/ },
    { name: 'GitHub Token', re: /\b(ghp|github_pat)_[A-Za-z0-9_]{20,}\b/ },
    { name: '私钥片段', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
    // Windows 绝对路径：用行首或非字母数字起始，避免 lookbehind
    { name: 'Windows 绝对路径泄露', re: /(^|[^A-Za-z0-9])[A-Za-z]:[\\/][^"\r\n<>|]+/ }
  ];
  var WARN_PATTERNS = [
    { name: '邮箱地址', re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i },
    { name: 'UUID', re: /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i },
    { name: '内网 IP', re: /\b(10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})\b/ },
    { name: 'Unix 用户路径', re: /\/(Users|home)\/[^/\s"']+/ }
  ];

  function securityCheck(text) {
    if (!text) return { level: 'safe', findings: [] };
    var findings = [];
    for (var i = 0; i < HIGH_RISK.length; i++) {
      HIGH_RISK[i].re.lastIndex = 0;
      if (HIGH_RISK[i].re.test(text)) {
        findings.push({ level: 'danger', name: HIGH_RISK[i].name });
      }
    }
    for (var j = 0; j < WARN_PATTERNS.length; j++) {
      WARN_PATTERNS[j].re.lastIndex = 0;
      if (WARN_PATTERNS[j].re.test(text)) {
        findings.push({ level: 'warn', name: WARN_PATTERNS[j].name });
      }
    }
    var level = 'safe';
    for (var k = 0; k < findings.length; k++) {
      if (findings[k].level === 'danger') { level = 'danger'; break; }
      level = 'warn';
    }
    return { level: level, findings: findings };
  }

  // ============================================================
  // 4) 主题容器 & 样式内联（保持和原来一致）
  // ============================================================
  function ensureHighlight() {
    if (global.hljs) return Promise.resolve(global.hljs);
    return new Promise(function (resolve) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github.min.css';
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js';
      var loaded = false;
      script.onload = function () { if (!loaded) { loaded = true; resolve(global.hljs); } };
      setTimeout(function () { if (!loaded) { loaded = true; resolve(null); } }, 6000);
      document.head.appendChild(link);
      document.head.appendChild(script);
    });
  }

  function getTheme(name) {
    return (global.QSThemes && global.QSThemes[name]) || global.QSThemes['default'];
  }

  function inline(spec) {
    if (!spec) return '';
    var out = [];
    for (var k in spec) {
      if (!Object.prototype.hasOwnProperty.call(spec, k)) continue;
      if (k === 'macStyle') continue;
      out.push(k + ':' + spec[k] + ';');
    }
    return out.join('');
  }

  function setStyle(el, spec) {
    if (!spec) return;
    el.style.cssText = (el.style.cssText ? el.style.cssText + ';' : '') + inline(spec);
  }

  function setAll(root, sel, specOrFn) {
    var nodes = typeof sel === 'string'
      ? root.querySelectorAll(sel)
      : root.querySelectorAll(sel.join(','));
    nodes.forEach(function (el) {
      if (typeof specOrFn === 'function') specOrFn(el);
      else setStyle(el, specOrFn);
    });
  }

  function wechatify(root, theme) {
    root.style.cssText = inline(theme.container) + 'word-break:break-word;';
    setAll(root, 'h1', theme.h1);
    setAll(root, 'h2', theme.h2);
    setAll(root, 'h3', theme.h3);
    setAll(root, ['h4', 'h5', 'h6'], theme.h3);
    setAll(root, 'p', theme.p);
    setAll(root, 'a', theme.a);
    setAll(root, ['strong', 'b'], theme.strong);
    setAll(root, ['em', 'i'], { fontStyle: 'italic' });
    setAll(root, 'blockquote', theme.blockquote);
    setAll(root, 'code', function (el) {
      if (el.parentNode && el.parentNode.tagName === 'PRE') return;
      setStyle(el, theme.codeInline);
    });
    var pres = root.querySelectorAll('pre');
    for (var p = 0; p < pres.length; p++) {
      var el = pres[p];
      setStyle(el, theme.pre);
      if (theme.pre.macStyle) {
        var bar = document.createElement('div');
        bar.style.cssText = 'display:flex;gap:6px;padding:8px 12px;background:#1b1f27;border-radius:8px 8px 0 0;';
        var colors = ['#ff5f56', '#ffbd2e', '#27c93f'];
        for (var c = 0; c < colors.length; c++) {
          var d = document.createElement('span');
          d.style.cssText = 'width:11px;height:11px;border-radius:50%;background:' + colors[c] + ';display:inline-block;';
          bar.appendChild(d);
        }
        if (el.parentNode) el.parentNode.insertBefore(bar, el);
        el.style.marginTop = '0';
        el.style.borderRadius = '0 0 8px 8px';
      }
      var codeEl = el.querySelector('code');
      if (codeEl) codeEl.style.cssText = 'font-family:inherit;background:transparent;color:inherit;padding:0;';
    }
    var tables = root.querySelectorAll('table');
    for (var t = 0; t < tables.length; t++) {
      var tbl = tables[t];
      tbl.style.cssText = 'border-collapse:collapse;width:100%;margin:16px 0;font-size:14px;';
      var tds = tbl.querySelectorAll('th,td');
      for (var td = 0; td < tds.length; td++) {
        tds[td].style.cssText = 'border:1px solid ' + theme.table.borderColor + ';padding:8px 10px;';
      }
      var ths = tbl.querySelectorAll('th');
      for (var th = 0; th < ths.length; th++) {
        ths[th].style.background = '#f5f5f5';
        ths[th].style.fontWeight = 'bold';
      }
    }
    setAll(root, 'img', theme.img);
    setAll(root, 'hr', theme.hr);
    var uls = root.querySelectorAll('ul,ol');
    for (var u = 0; u < uls.length; u++) uls[u].style.cssText = 'padding-left:22px;margin:12px 0;';
    var lis = root.querySelectorAll('li');
    for (var li = 0; li < lis.length; li++) lis[li].style.cssText = 'margin:6px 0;line-height:1.7;';
    setAll(root, '.qs-slide', theme.slide);
    var slideNums = root.querySelectorAll('.qs-slide-num');
    for (var sn = 0; sn < slideNums.length; sn++) {
      slideNums[sn].style.cssText = 'display:inline-block;background:' + theme.slide.numberColor + ';color:#fff;width:24px;height:24px;line-height:24px;text-align:center;border-radius:50%;font-size:13px;margin-right:8px;vertical-align:middle;';
    }
    return root;
  }

  function fragmentToHtml(htmlString, themeName) {
    var theme = getTheme(themeName);
    var div = document.createElement('div');
    div.innerHTML = (htmlString || '').trim();
    wechatify(div, theme);
    return div.innerHTML;
  }

  function mdToHtml(md, themeName) {
    var mdIt = global.markdownit({ html: true, linkify: true, typographer: true, breaks: false });
    var html = mdIt.render(md || '');
    return fragmentToHtml(html, themeName);
  }

  function docxToHtml(arrayBuffer, themeName) {
    if (!global.mammoth) return Promise.reject(new Error('mammoth \u672A\u52A0\u8F7D'));
    return global.mammoth.convertToHtml({ arrayBuffer: arrayBuffer }).then(function (result) {
      return fragmentToHtml(result.value || '', themeName);
    });
  }

  function pptxToHtml(arrayBuffer, themeName) {
    if (!global.JSZip) return Promise.reject(new Error('JSZip \u672A\u52A0\u8F7D'));
    var zip;
    return global.JSZip.loadAsync(arrayBuffer).then(function (z) {
      zip = z;
      var slidePaths = Object.keys(zip.files)
        .filter(function (f) { return /^ppt\/slides\/slide\d+\.xml$/.test(f); })
        .sort(function (a, b) { return slideNum(a) - slideNum(b); });
      if (!slidePaths.length) return '<p>\u672A\u5728\u8BE5 PPTX \u4E2D\u53D1\u73B0\u5E7B\u706F\u7247\u3002</p>';
      var tasks = [];
      for (var i = 0; i < slidePaths.length; i++) tasks.push(renderSlide(zip, slidePaths[i], i + 1));
      return Promise.all(tasks).then(function (sections) { return sections.join(''); });
    });
  }

  function slideNum(path) {
    var m = path.match(/slide(\d+)\.xml$/);
    return m ? parseInt(m[1], 10) : 0;
  }

  function renderSlide(zip, slidePath, index) {
    var relsPath = 'ppt/slides/_rels/' + slidePath.split('/').pop() + '.rels';
    var relsFile = zip.file(relsPath);
    var relMap = {};
    var slideFile = zip.file(slidePath);
    if (!slideFile) return Promise.resolve('');
    var relsPromise = relsFile ? relsFile.async('text') : Promise.resolve('');
    return relsPromise.then(function (relsText) {
      if (relsText) {
        var re = /Id="(rId\d+)"[^>]*Target="([^"]+)"/g;
        var m;
        while ((m = re.exec(relsText))) relMap[m[1]] = m[2];
      }
      return slideFile.async('text');
    }).then(function (xml) {
      var texts = [];
      var tRe = /<a:t>([\s\S]*?)<\/a:t>/g;
      var tm;
      while ((tm = tRe.exec(xml))) {
        var t = decodeXml(tm[1]).trim();
        if (t) texts.push(t);
      }
      var imgPromises = [];
      var bRe = /<a:blip r:embed="(rId\d+)"\s*\/>/g;
      var bm;
      while ((bm = bRe.exec(xml))) {
        var rid = bm[1];
        var target = relMap[rid];
        if (!target) continue;
        var mediaPath = 'ppt/' + target.replace(/^\.\.\//, '');
        var f = zip.file(mediaPath);
        if (f) imgPromises.push(mediaDataUri(f));
      }
      return Promise.all(imgPromises).then(function (imgs) {
        var title = texts.shift() || ('\u7B2C ' + index + ' \u9875');
        var body = '';
        for (var i = 0; i < texts.length; i++) body += '<p>' + escapeHtml(texts[i]) + '</p>';
        var imgHtml = '';
        for (var j = 0; j < imgs.length; j++) imgHtml += '<p><img src="' + imgs[j] + '"></p>';
        return '<section class="qs-slide"><span class="qs-slide-num">' + index + '</span><h3>' +
          escapeHtml(title) + '</h3>' + body + imgHtml + '</section>';
      });
    });
  }

  function mediaDataUri(file) {
    var ext = (file.name || '').split('.').pop().toLowerCase();
    var mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', bmp: 'image/bmp' };
    var mime = mimeMap[ext] || 'image/png';
    return file.async('base64').then(function (b64) { return 'data:' + mime + ';base64,' + b64; });
  }

  function decodeXml(s) {
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function docToHtml() {
    throw new Error('\u65E7\u7248 .doc \u4E3A\u4E8C\u8FDB\u5236 OLE \u683C\u5F0F\uFF0C\u6D4F\u89C8\u5668\u5185\u65E0\u6CD5\u89E3\u6790\u3002\u8BF7\u5148\u5728 Word \u4E2D\u53E6\u5B58\u4E3A .docx \u518D\u62D6\u5165\u3002');
  }

  function buildClipboardHtml(innerHtml, themeName) {
    var theme = getTheme(themeName);
    return '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div style="' +
      inline(theme.container) + 'word-break:break-word;">' + innerHtml + '</div></body></html>';
  }

  function highlightInHtml(html) {
    if (!/<pre[^>]*>\s*<code/i.test(html)) return Promise.resolve(html);
    var div = document.createElement('div');
    div.innerHTML = html;
    var blocks = div.querySelectorAll('pre code');
    if (!blocks.length) return Promise.resolve(html);
    return ensureHighlight().then(function (hljs) {
      if (!hljs) return div.innerHTML;
      for (var i = 0; i < blocks.length; i++) {
        try { hljs.highlightElement(blocks[i]); } catch (e) { /* ignore */ }
      }
      return div.innerHTML;
    });
  }

  function parseFile(file, themeName) {
    var name = file.name || '\u672A\u547D\u540D';
    var ext = name.split('.').pop().toLowerCase();
    var title = name.replace(/\.[^.]+$/, '');
    var p;
    if (ext === 'md' || ext === 'markdown' || ext === 'txt') {
      p = file.text().then(function (t) {
        var issues = validateMarkdown(t);
        if (issues.length) {
          var msgLines = [];
          for (var i = 0; i < issues.length; i++) {
            msgLines.push('\u7B2C ' + issues[i].line + ' \u884C: ' + issues[i].name + ' \u2014 ' + issues[i].hint);
          }
          throw new Error('Markdown \u8BED\u6CD5\u4E0D\u652F\u6301\uFF1A\n' + msgLines.join('\n'));
        }
        return mdToHtml(t, themeName);
      });
    } else if (ext === 'docx') {
      p = file.arrayBuffer().then(function (b) { return docxToHtml(b, themeName); });
    } else if (ext === 'pptx') {
      p = file.arrayBuffer().then(function (b) { return pptxToHtml(b, themeName); });
    } else if (ext === 'doc') {
      p = Promise.reject(docToHtml());
    } else {
      p = Promise.reject(new Error('\u4E0D\u652F\u6301\u7684\u683C\u5F0F\uFF1A.' + ext + '\uFF08\u652F\u6301 md/docx/pptx\uFF0Cdoc \u8BF7\u8F6C docx\uFF09'));
    }
    return p.then(function (html) { return highlightInHtml(html); })
      .then(function (html) { return { html: html, title: title, kind: ext }; });
  }

  // ============================================================
  // 5) 导出（ES5 全局挂载）
  // ============================================================
  global.QSConverter = {
    mdToHtml: mdToHtml,
    docxToHtml: docxToHtml,
    pptxToHtml: pptxToHtml,
    docToHtml: docToHtml,
    wechatify: wechatify,
    buildClipboardHtml: buildClipboardHtml,
    parseFile: parseFile,
    getTheme: getTheme,
    validateMarkdown: validateMarkdown,
    extractImageList: extractImageList,
    securityCheck: securityCheck
  };
})(typeof window !== 'undefined' ? window : this);
