/*
 * themes.js — 瑾之笺·排版主题/模板系统（可筛选样式）
 * 纯前端模块，挂载到 window.QSThemes / window.QSThemeOrder。
 * 每个主题是一组"样式规格"，由 converter.js 的 wechatify 在转换时以内联样式套用，
 * 保证粘贴进微信公众号编辑器后不丢格式（微信会剥离 <style> 与 class，只保留内联样式）。
 *
 * 版权：本文件为独立编写，归瑾之笺独占版权。
 * 模板调色板为 clean-room 重建：参考了公开主题名称（mdnice / doocs·md / 掘金 / mweb /
 * markdown-here-css / gzh-design-skill 等），按其命名独立设计配色，不复制任何第三方 CSS 源码。
 */
(function (global) {
  'use strict';

  var FONT_SANS = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif';
  var FONT_SERIF = 'Georgia, "Songti SC", "SimSun", "STSong", serif';
  var FONT_KAI = '"Kaiti SC", "KaiTi", "STKaiti", serif';
  var FONT_MONO = '"SF Mono", "JetBrains Mono", Consolas, Menlo, monospace';

  // 主题工厂：用少量配色参数生成完整内联样式规格
  function M(o) {
    var F = o.serif ? FONT_SERIF : (o.kai ? FONT_KAI : FONT_SANS);
    var c = o.accent || '#2f2f2f';
    var bg = o.bg || '#ffffff';
    var text = o.text || '#3f3f3f';
    var fs = o.fs || 16, lh = o.lh || 1.8;
    return {
      label: o.label, desc: o.desc,
      container: { background: bg, padding: '0 2px', fontFamily: F, color: text, fontSize: fs + 'px', lineHeight: lh },
      h1: { fontSize: (o.h1 || 22) + 'px', color: c, fontWeight: 'bold', borderLeft: '4px solid ' + c, paddingLeft: '10px', margin: '28px 0 14px', textAlign: o.center ? 'center' : 'left' },
      h2: { fontSize: (o.h2 || 19) + 'px', color: c, fontWeight: 'bold', borderLeft: '4px solid ' + c, paddingLeft: '10px', margin: '24px 0 12px' },
      h3: { fontSize: (o.h3 || 17) + 'px', color: c, fontWeight: 'bold', margin: '20px 0 10px' },
      p: { color: text, fontSize: fs + 'px', lineHeight: lh, margin: '12px 0' },
      a: { color: c, textDecoration: 'none' },
      strong: { color: o.strong || c, fontWeight: 'bold' },
      blockquote: { background: o.quoteBg || '#f7f7f7', borderLeft: '4px solid ' + (o.quoteBar || '#d0d0d0'), color: o.quoteText || '#6b6b6b', padding: '12px 16px', margin: '16px 0', fontStyle: o.quoteItalic ? 'italic' : 'normal' },
      codeInline: { background: o.codeInlineBg || '#f2f2f2', color: o.codeInline || '#c7254e', padding: '2px 6px', borderRadius: '4px', fontFamily: FONT_MONO, fontSize: '14px' },
      pre: { background: o.codeBg || '#282c34', color: o.codeFg || '#abb2bf', padding: '14px 16px', borderRadius: '8px', fontFamily: FONT_MONO, fontSize: '14px', lineHeight: '1.6', macStyle: !!o.codeMac },
      table: { borderColor: o.tableBorder || '#e0e0e0' },
      img: { maxWidth: '100%', display: 'block', margin: '16px auto', borderRadius: (o.imgRound || 4) + 'px' },
      hr: { border: 'none', borderTop: '1px solid ' + (o.hr || '#e8e8e8'), margin: '24px 0' },
      slide: { background: o.slideBg || bg, border: '1px solid ' + (o.slideBorder || '#e8e8e8'), borderRadius: o.slideRound || '10px', padding: '18px 20px', margin: '18px 0', numberColor: c }
    };
  }

  var THEMES = {
    'default': M({ label: '默认简约', desc: '通用百搭，微信原生感', accent: '#2f2f2f' }),
    'rose': M({ label: '蔷薇紫', desc: '优雅紫色系（mdnice 灵感）', accent: '#b33771', quoteBg: '#fceaf2', quoteBar: '#b33771', codeInlineBg: '#fceaf2', codeInline: '#b33771' }),
    'geek-black': M({ label: '极客黑', desc: '程序员最爱，深色代码块', accent: '#58a6ff', bg: '#0d1117', text: '#c9d1d9', quoteBg: '#161b22', quoteBar: '#58a6ff', quoteText: '#8b949e', codeBg: '#161b22', codeFg: '#79c0ff', codeMac: true, tableBorder: '#30363d', hr: '#30363d' }),
    'science-blue': M({ label: '科技蓝', desc: '科技感蓝色（mdnice 灵感）', accent: '#1e6fff' }),
    'extreme-black': M({ label: '极简黑', desc: '黑白极简（mdnice 灵感）', accent: '#111111', bg: '#ffffff', text: '#222222' }),
    'blue-mountain': M({ label: '前端之巅', desc: '专业技术蓝（mdnice 灵感）', accent: '#2f80ed' }),
    'normal': M({ label: '默认灰', desc: '微信中性灰，干净通用', accent: '#07c160', codeInline: '#07c160' }),
    'shanchui': M({ label: '山吹', desc: '温暖黄色（mdnice 灵感）', accent: '#f08c00', quoteBg: '#fff4e6', quoteBar: '#f08c00', codeInlineBg: '#fff4e6', codeInline: '#e8590c' }),
    'fullstack-blue': M({ label: '全栈蓝', desc: '专业蓝（mdnice 灵感）', accent: '#1565ff' }),
    'night-purple': M({ label: '凝夜紫', desc: '深邃紫（mdnice 灵感）', accent: '#8b7bff', bg: '#0b0c2a', text: '#c9c9ff', quoteBg: '#16173a', quoteBar: '#8b7bff', quoteText: '#a9a9e0', codeBg: '#16173a', codeFg: '#c4b5fd', codeMac: true, tableBorder: '#3b3b6b', hr: '#3b3b6b' }),
    'cute-green': M({ label: '萌绿', desc: '清新绿（mdnice 灵感）', accent: '#2f9e44', quoteBg: '#ebfbee', quoteBar: '#2f9e44', codeInlineBg: '#ebfbee', codeInline: '#2b8a3e' }),
    'orange-heart': M({ label: '橙心', desc: '活力橙（mdnice 灵感）', accent: '#e8590c' }),
    'ink': M({ label: '墨黑', desc: '水墨风，衬线（mdnice 灵感）', accent: '#1a1a1a', serif: true }),
    'purple': M({ label: '姹紫', desc: '紫色系（mdnice 灵感）', accent: '#9c36b5', quoteBg: '#f8eefb', quoteBar: '#9c36b5', codeInlineBg: '#f8eefb', codeInline: '#9c36b5' }),
    'green': M({ label: '绿意', desc: '绿色系（mdnice 灵感）', accent: '#2b8a3e' }),
    'cyan': M({ label: '嫩青', desc: '小清新青（mdnice 灵感）', accent: '#0c8599', quoteBg: '#e6f7f9', quoteBar: '#0c8599', codeInlineBg: '#e6f7f9', codeInline: '#0c8599' }),
    'wechat-format': M({ label: '微信官方', desc: '微信官方绿', accent: '#07c160', codeInline: '#07c160' }),
    'blue-cyan': M({ label: '兰青', desc: '蓝青专业（mdnice 灵感）', accent: '#1098ad' }),
    'red': M({ label: '红绯', desc: '红色热情（mdnice 灵感）', accent: '#e03131', quoteBg: '#fff5f5', quoteBar: '#e03131', codeInlineBg: '#fff5f5', codeInline: '#e03131' }),
    'blue': M({ label: '蓝莹', desc: '沉稳蓝（mdnice 灵感）', accent: '#1971c2' }),
    'simple': M({ label: '简', desc: '极简主义（mdnice 灵感）', accent: '#495057' }),
    'moyu-green': M({ label: '摸鱼绿', desc: '教程/盘点（gzh-design 灵感）', accent: '#2f9e44', quoteBg: '#ebfbee', quoteBar: '#2f9e44', slideBg: '#f4fce9', slideBorder: '#b2f2bb' }),
    'red-white': M({ label: '红白', desc: '深度分析/力量感（gzh-design 灵感）', accent: '#e03131', bg: '#ffffff', text: '#212529', quoteBg: '#fff5f5', quoteBar: '#e03131' }),
    'graphite': M({ label: '石墨极简', desc: '设计/科技评论（gzh-design 灵感）', accent: '#212529', bg: '#fafafa', text: '#343a40' }),
    'zen': M({ label: '留白禅意', desc: '禅意极简随笔（gzh-design 灵感）', accent: '#495057', bg: '#fbfbf9', text: '#3a3a3a', serif: true, lh: 2.0 }),
    'ticket': M({ label: '摸鱼票据', desc: '工具对比/评测（gzh-design 灵感）', accent: '#364fc7', quoteBg: '#eef2ff', quoteBar: '#364fc7', slideBg: '#f5f7ff', slideBorder: '#bac8ff' }),
    'olive': M({ label: '橄榄手记', desc: '内刊手记/复盘（gzh-design 灵感）', accent: '#5c7c2f', quoteBg: '#f4f7ec', quoteBar: '#5c7c2f' }),
    'ink-chinese': M({ label: '国风墨韵', desc: '文化历史，楷体朱砂', accent: '#9e2b25', kai: true, bg: '#fdfcf8', text: '#2c2620', quoteBg: '#f6f1e7', quoteBar: '#c0392b' }),
    'magazine-blackgold': M({ label: '杂志黑金', desc: '深度长文，衬线高级感', accent: '#b8860b', serif: true, bg: '#ffffff', text: '#1a1a1a', quoteBg: '#faf7f0', quoteBar: '#b8860b', quoteItalic: true }),
    'warm-orange': M({ label: '暖阳橙', desc: '生活/情感，圆润胶囊', accent: '#e8590c', bg: '#fffaf5', text: '#4a3f38', quoteBg: '#fff0e0', quoteBar: '#ffa94d', quoteText: '#8a6d5a', imgRound: 10, slideRound: 14 }),
    'geek-blue': M({ label: '极客蓝', desc: '技术号，渐变徽章标题', accent: '#0b5fff', quoteBg: '#eef4ff', quoteBar: '#0b5fff', quoteText: '#3a5a85', codeMac: true, slideBg: '#f7faff', slideBorder: '#cfe0ff' }),
    'juejin': M({ label: '掘金', desc: '技术社区蓝（掘金灵感）', accent: '#1e80ff', quoteBg: '#e8f3ff', quoteBar: '#1e80ff', codeInlineBg: '#e8f3ff', codeInline: '#1e80ff' }),
    'github': M({ label: 'GitHub', desc: 'GitHub 风（掘金灵感）', accent: '#24292f', bg: '#ffffff', codeBg: '#f6f8fa', codeFg: '#24292f', codeMac: false, codeInlineBg: '#eff0f1', codeInline: '#cf222e' }),
    'chinese-red': M({ label: '中国红', desc: '喜庆力量（掘金灵感）', accent: '#c20c0c', quoteBg: '#fdeaea', quoteBar: '#c20c0c', codeInlineBg: '#fdeaea', codeInline: '#c20c0c' }),
    'arknights': M({ label: '明日方舟', desc: '游戏风蓝橙（掘金灵感）', accent: '#f0a020', bg: '#1f2430', text: '#d7dde8', quoteBg: '#2a3140', quoteBar: '#f0a020', quoteText: '#aab3c5', codeBg: '#11151c', codeFg: '#7fd1c0' }),
    'xiaolai': M({ label: '笑来白', desc: '极简写作（markdown-here 灵感）', accent: '#333333', bg: '#ffffff', text: '#333333', quoteBg: '#f5f5f5', quoteBar: '#333333' }),
    'apollo': M({ label: 'Apollo', desc: '商务蓝灰（markdown-here 灵感）', accent: '#2b5797', quoteBg: '#eef2f9', quoteBar: '#2b5797' }),
    'ocean': M({ label: 'Ocean', desc: '海蓝（markdown-here 灵感）', accent: '#0366d6', quoteBg: '#e8f0fe', quoteBar: '#0366d6' }),
    'infoq': M({ label: 'InfoQ', desc: '红橙科技（markdown-here 灵感）', accent: '#e8590c', quoteBg: '#fff0e6', quoteBar: '#e8590c' }),
    'serif-elegant': M({ label: '衬线雅致', desc: '文艺长文衬线', accent: '#5b4636', serif: true, bg: '#fdfbf7', text: '#3a322a', quoteBg: '#f3ede2', quoteBar: '#5b4636', quoteItalic: true })
  };

  global.QSThemes = THEMES;
  global.QSThemeOrder = Object.keys(THEMES);

  /*
   * 免费图库清单（瑾之笺内置"图库"面板数据源）
   * license 字段为各站公开声明，使用请自行再次确认；涉及人脸/品牌/建筑的图片商用前建议复核。
   * search 为按关键词打开来源站内搜索页的模板（{q} 替换为关键词）。
   */
  global.QSImageLibrary = [
    { name: 'Unsplash', cat: '高清摄影', license: 'Unsplash License（可商用，建议署名）', url: 'https://unsplash.com/', search: 'https://unsplash.com/s/photos/{q}' },
    { name: 'Pexels', cat: '图+视频', license: 'Pexels License / CC0（可商用免署名）', url: 'https://www.pexels.com/zh-cn/', search: 'https://www.pexels.com/zh-cn/search/{q}/' },
    { name: 'Pixabay', cat: '图/矢量/视频', license: 'Pixabay Content License（类 CC0）', url: 'https://pixabay.com/zh/', search: 'https://pixabay.com/zh/images/search/{q}/' },
    { name: 'StockSnap', cat: '精选摄影', license: 'CC0', url: 'https://stocksnap.io/', search: 'https://stocksnap.io/search/{q}' },
    { name: 'Pixnio', cat: '文艺简约', license: 'CC0', url: 'https://pixnio.com/', search: 'https://pixnio.com/?s={q}' },
    { name: 'Kaboompics', cat: '生活化配色', license: '免费可商用（含配色方案）', url: 'https://kaboompics.com/', search: 'https://kaboompics.com/search?q={q}' },
    { name: 'Burst (Shopify)', cat: '电商/创业', license: 'CC0', url: 'https://www.shopify.com/stock-photos', search: 'https://www.shopify.com/stock-photos?q={q}' },
    { name: 'Foodiesfeed', cat: '美食专类', license: '免费可商用', url: 'https://www.foodiesfeed.com/', search: 'https://www.foodiesfeed.com/?s={q}' },
    { name: 'Visual Hunt', cat: '按颜色搜图', license: 'CC0 / 免费', url: 'https://visualhunt.com/', search: 'https://visualhunt.com/search/{q}' },
    { name: 'Hippopx 泼辣有图', cat: 'CC0 中文', license: 'CC0（中文检索）', url: 'https://www.hippopx.com/zh', search: 'https://www.hippopx.com/zh/query/{q}' },
    { name: 'Lorem Picsum', cat: '占位图', license: '免费（占位用）', url: 'https://picsum.photos/', search: 'https://picsum.photos/seed/{q}/1200/800' },
    { name: 'Publicdomainvectors', cat: '矢量图', license: '公有领域矢量', url: 'https://publicdomainvectors.org/zh/', search: 'https://publicdomainvectors.org/zh/search/?q={q}' },
    { name: 'SVG Repo', cat: 'SVG 图标', license: '免费（注意单文件许可）', url: 'https://www.svgrepo.com/', search: 'https://www.svgrepo.com/search?q={q}' },
    { name: 'unDraw', cat: '免费插画', license: 'MIT（可商用免署名）', url: 'https://undraw.co/illustrations', search: 'https://undraw.co/illustrations' },
    { name: 'Iconfont 阿里', cat: '图标', license: '免费（部分需授权）', url: 'https://www.iconfont.cn/', search: 'https://www.iconfont.cn/search?q={q}' },
    { name: 'OpenMoji', cat: '开源 emoji', license: 'CC BY-SA 4.0', url: 'https://openmoji.org/', search: 'https://openmoji.org/' },
    { name: 'GIPHY', cat: '动图 GIF', license: '免费（商用请阅条款）', url: 'https://giphy.com/', search: 'https://giphy.com/search/{q}' },
    { name: 'Tenor', cat: '动图 GIF', license: '免费（商用请阅条款）', url: 'https://tenor.com/', search: 'https://tenor.com/search/{q}' },
    { name: 'Pexels 视频', cat: '视频素材', license: 'Pexels License / CC0', url: 'https://www.pexels.com/zh-cn/videos/', search: 'https://www.pexels.com/zh-cn/videos/search/{q}/' },
    { name: 'Coverr', cat: '视频素材', license: '免费可商用', url: 'https://coverr.co/', search: 'https://coverr.co/search?q={q}' }
  ];
})(typeof window !== 'undefined' ? window : this);