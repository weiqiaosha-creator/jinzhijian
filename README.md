# 瑾之笺 — 微信公众号排版发布工具

> 多格式（Markdown / DOCX / PPTX）一键拖入公众号后台 · 数十套可筛选模板 · 插入编辑器样式零丢失 · 免费图库 · 推草稿 / 定时群发

**瑾之笺** 是一套**独立版权、clean-room 实现**的微信公众号排版发布工具。它以源码形式同时提供两种落地形态：

1. **独立网页工具**（打开 `index.html` 即可用，无需安装）
2. **浏览器扩展**（Chrome / Edge，MV3 规范，`stable/` 目录，加载已解压的扩展程序即可）

---

## ✨ 功能特性

- 📄 **多格式拖入**：`.md` / `.markdown` / `.txt` / `.docx` / `.pptx` 直接拖入公众号后台，自动转换为带内联样式的 HTML
- 🎨 **模板筛选**：数十套可筛选主题（默认简约、墨黑、全栈蓝等），每套主题独立配色，切换即生效
- 🖱️ **插入编辑器**：点击一次，将带内联样式的 DOM 节点直接迁入正文编辑器，**样式不会被微信清洗**
- 📱 **手机预览**：插入前预览实际排版效果（与编辑器所见一致）
- 🖼️ **免费图库**：内置免费可商用图库检索入口（Pexels / Coverr / OpenMoji 等）
- 📤 **推草稿 / 定时群发**：认证号走微信 API 定时群发，个人号通过浏览器自动化实现定时发表（需搭配本地 `server.js`）
- 🔒 **内容安全**：转换前后做语法白名单与安全检查，规避脚本注入等风险

---

## 🚀 快速开始

### 方式一：独立网页工具（免安装）

直接用浏览器打开项目根目录的 `index.html` 即可。无需安装、无需登录，纯前端离线可用。

### 方式二：浏览器扩展（推荐日常使用）

1. 打开浏览器扩展管理页：
   - Chrome：`chrome://extensions/`
   - Edge：`edge://extensions/`
2. 打开右上角 **「开发者模式」**
3. 点击 **「加载已解压的扩展程序」** → 选择本仓库的 **`stable/`** 目录
4. 登录公众号后台 `mp.weixin.qq.com`，右下角会出现 **瑾之笺** 浮动面板
5. 把 `.md` / `.docx` / `.pptx` 文件直接拖入面板 → 选主题 → 点「插入编辑器」→ 完成

---

## 🗂️ 目录结构

```
瑾之笺/
├── index.html            # 独立网页工具入口
├── app.js                # 网页工具交互逻辑
├── manifest.json         # 浏览器扩展清单（MV3）
├── background.js         # 扩展 Service Worker
├── content.js            # 注入公众号后台的浮动面板
├── converter.js          # 多格式 → 内联 HTML 核心转换器
├── themes.js             # 主题 / 模板系统
├── wechat-common.js      # 微信 API 共享逻辑（浏览器 + Node 通用）
├── server.js             # 本地推送服务（推草稿 / 定时群发）
├── popup.html / popup.js # 扩展弹窗（凭证配置）
├── markdown-it.min.js    # 第三方库（Markdown 渲染，MIT）
├── mammoth.browser.min.js# 第三方库（DOCX 转换，BSD-2-Clause）
├── jszip.min.js          # 第三方库（ZIP 解析，MIT）
├── LICENSE               # 本仓库许可证
├── THIRD_PARTY_LICENSES  # 第三方库许可证声明
└── stable/               # 稳定版扩展（加载此目录）
```

---

## 🧩 版权与声明

- **独立版权**：本仓库的自研代码（`content.js` / `converter.js` / `themes.js` / `wechat-common.js` / `app.js` / `server.js` / `popup.js` / `background.js` 等）由作者独立编写，归**瑾之笺**独占版权。
- **Clean-Room 声明**：主题调色板参考了 mdnice / doocs·md / 掘金 / mweb / markdown-here-css 等公开主题**名称**，按其命名**独立设计配色**，**不复制任何第三方 CSS 源码**；Markdown 语法白名单与图片证据表**仅参考思路**（受 wechat-article-pipeline 启发），由本仓库独立实现。
- **第三方库**：使用的 markdown-it / mammoth / JSZip 均按各自许可证条款使用，完整许可证见 [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES)。
- **免责声明**：本插件与微信公众号、壹伴、mdnice、doocs·md 等**无任何关联或背书**。本软件按“现状”提供，无任何明示或暗示的担保。

### 开源许可

本仓库默认按根目录 [LICENSE](LICENSE)（MIT）开源。商业使用 / 闭源整合欢迎联系作者洽谈。

---

## 💰 赞助与支持

本项目开源免费，欢迎 Star、Issue 反馈与使用。支持作者持续维护：

<p align="center">
  <a href="https://afdian.com/a/qiaoshan95236" target="_blank"><img alt="爱发电" src="https://img.shields.io/badge/%E7%88%B1%E5%8F%91%E7%94%B5-Support%20on%20Afdian-3B82F6?style=for-the-badge&logo=wechat"/></a>
  &nbsp;&nbsp;
  <a href="https://github.com/weiqiaosha-creator/jinzhijian" target="_blank"><img alt="GitHub" src="https://img.shields.io/badge/GitHub-Star-00A86B?style=for-the-badge&logo=github"/></a>
</p>

<div align="center">
  <details open>
    <summary><b>微信赞赏（长按或扫码，金额随意，感谢支持 ✨）</b></summary>
    <br>
    <img src="images/wechat-reward.jpg" alt="瑾之笺·微信赞赏码" width="260" height="260" style="border-radius:10px;border:1px solid #e3e6ea;"/>
    <p><i>（若图片未显示：请将你的赞赏码保存为 <code>images/wechat-reward.jpg</code> 后，在本仓库 <b>images/</b> 目录替换占位即可）</i></p>
  </details>
</div>

- 爱发电主页（会员 / 付费内容 / 定制服务）：<https://afdian.com/a/qiaoshan95236>
- GitHub 仓库：<https://github.com/weiqiaosha-creator/jinzhijian>

---

## ⚠️ 注意事项

- 定时群发依赖微信公众号 API 的 `access_token` 与权限；个人号自动发表存在平台策略风险，请自行评估合规性。
- 请遵守《微信公众平台运营规范》，不得使用本工具发送违规内容。
- 模板 / 表情 / 图库资源均标注了来源与许可证，使用前请确认其商用授权。