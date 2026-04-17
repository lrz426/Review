# 单人手机版小程序（PWA）

这个目录是纯前端 PWA 版本：

- 单人使用
- 数据保存在浏览器本地（`localStorage`）
- 支持安装到手机桌面
- 支持离线打开

## 文件结构

- `index.html` 页面
- `style.css` 样式
- `app.js` 业务逻辑（本地存储）
- `manifest.webmanifest` 小程序清单
- `sw.js` Service Worker 离线缓存
- `icons/` 图标

## 本地预览

在这个目录运行：

```powershell
python -m http.server 8080
```

打开：`http://127.0.0.1:8080`

## 手机上安装

1. 把本目录部署到 HTTPS 网址（推荐 GitHub Pages）。
2. 手机打开该网址。
3. iPhone：Safari -> 分享 -> 添加到主屏幕。
4. Android：Chrome -> 添加到主屏幕 / 安装应用。

## 注意

- 数据只保存在当前浏览器本地。
- 清除浏览器站点数据后，任务记录会被清空。
- 若要换手机同步，需要改造为云端存储（可后续再加）。
