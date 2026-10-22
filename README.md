# 面迹 · 面条宇宙正在生成中

记录在各地吃过的面：店名、面名、类型、评分、价格、地点、照片和一句话。
纯前端 PWA，数据只存在当前设备的浏览器里，不登录、不上传、不需要后端。

**线上地址**：<https://gmiantiao.github.io/noodle-journal/>

iPhone Safari 打开后 → 分享 → 添加到主屏幕。

## 本地运行

```bash
cd noodle-journal
python3 -m http.server 8000
```

打开 <http://localhost:8000>。手机连同一 Wi-Fi 时可以用电脑的局域网 IP 访问，
但**离线安装需要 HTTPS**（iOS Safari 的限制），局域网 HTTP 下只能看和记，不能装到主屏幕。

## 装到 iPhone 上

1. 把这个目录部署到任意 HTTPS 静态托管（GitHub Pages / Cloudflare Pages / Vercel 都行）。
2. iPhone Safari 打开网址 → 分享 → **添加到主屏幕**。
3. 从主屏幕启动，就是全屏 App，断网也能用。

> 数据按「域名 + 浏览器」隔离。换域名、换浏览器等于换一个空数据库，**换之前先导出备份**。

## 离线

首次打开、添加到主屏幕之后，应用外壳会缓存到本机。此后**没有网络也能记录、翻看、统计和导出**。
应用没有任何外部依赖和网络请求，断网时功能完整；只有应用更新需要联网。
缓存策略是「缓存优先、后台刷新」，所以打开不会等网络超时；更新在下次启动时生效。

## 数据

- 存在浏览器 IndexedDB（`noodle-journal` 数据库），照片压缩后一起存本地。
- 右上角 `⋯` → 导出备份（JSON）。iOS 独立模式下会走系统分享，存到「文件」或发给微信。
- 导入会按 `id` 去重，同一条记录不会重复添加。
- 清空不可撤销。

## 文件

```
index.html          页面骨架 + 内联 SVG 图标
styles.css          样式（浅色/深色自动跟随系统）
app.js              视图、表单、统计、导入导出
db.js               IndexedDB 封装
sw.js               Service Worker，缓存应用外壳
manifest.webmanifest
icons/              主屏幕图标
tools/make-icons.py 图标生成脚本（Pillow）
mockup/index.html   7 月的设计原型（保留，不参与运行）
```

## 当前范围

已做：记录增删改、类型筛选、标签筛选、搜索、拍照/相册、5 档碗评分、
城市足迹（按碗数排序、最近一次去的日期）、按月统计、常去店铺、年度分布、
自定义面型、多标签、点开记录查看详情、单碗信息分享图、年度海报分享、
JSON 导入导出、离线缓存、深浅色。

没做（可作为下一步）：

- 照片主体抠图做贴纸（浏览器端可用 ONNX 模型，首次需下载几 MB）
- 多设备同步（现在纯本地）
- 把 `food-journal/entries/` 的旧记录批量导入（那些是「想去的店」，字段不同）
- 用 Capacitor 套壳上架 App Store（需要 Apple 开发者账号和一台能跑新 Xcode 的 Mac）

## 改名

「面迹」出现在 `index.html` 的 `<title>`、顶部品牌、`manifest.webmanifest` 的 `name`/`short_name`，
以及 `app.js` 的导出文件名里。要换名字改这几处即可。
