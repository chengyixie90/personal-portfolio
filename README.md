# 谢易宸 · 个人作品集

静态个人作品集网站，包含首页、FLOW TAROT、缥缈诗篇、国王剧场、短视频广告四个项目。

## 运行

无需安装依赖或编译。用任意静态 HTTP 服务打开根目录，例如：

```sh
python3 -m http.server 8080
```

打开 http://localhost:8080。

## 目录

- `index.html`：首页及简历入口
- `flow.html`、`poetry.html`、`king.html`、`ads.html`：项目独立页
- `assets/`：图片、视频
- `documents/`：简历及中英文说明书 PDF
- CSS、JavaScript：布局、滚动渐显、画廊与图片弹窗

## 部署

可上传到腾讯云 COS / CloudBase 静态网站托管，或普通静态服务器。网站根目录直接放置 index.html，索引文档设为 index.html。

所有项目采用相对链接，可部署于域名根目录或子目录。无需 Node.js、数据库或后端服务。

## 内容更新

修改对应 HTML、CSS 或 JavaScript 后重新部署。首页简历入口指向 `documents/谢易宸-文案编辑.pdf`；旧 resume.pdf 作为兼容文件保留。

## 素材说明

项目图片、文本、视频及 PDF 包含个人作品及团队项目展示资料。本仓库不自动授予素材使用许可，团队署名及个人贡献边界见相应项目页。
