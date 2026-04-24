# 跑团地图助手（Map Playing）

一个可直接部署在服务器上的轻量网页工具（纯静态前端 + Nginx），用于跑团地图展示与 Token 管理。

## 功能

- 上传背景地图并按百分比缩放（20%~300%），地图固定不可拖动。
- 新增多个 Token，支持名字（可留空）、颜色。
- 拖动 Token 时，在落点后触发从 A 到 B 的缓动动画。
- Token 支持锁定/解锁、编辑名字、删除。
- 提供可展开的 Token 列表管理区。
- 所有状态保存在浏览器 `localStorage`，无需后端，服务器负载极低。

## 方式一：Docker 部署（推荐）

需要安装 Docker 与 Docker Compose。

```bash
docker compose up -d --build
```

启动后访问：

- `http://<你的服务器IP>:4444`

## 方式二：不使用 Docker（支持“压缩包”）

可以。这个项目是纯静态页面，你可以直接下载压缩包并解压后部署，不需要安装 Node / Python 等额外运行时。

### 2.1 直接下载仓库压缩包

在代码托管平台（如 GitHub/GitLab）点击：

- `Code` -> `Download ZIP`

解压后会得到 `index.html / styles.css / app.js` 等文件。

### 2.2 上传到任意静态站点目录

把这几个文件放到你已有的网站目录即可（例如 Nginx 的 `/var/www/html`、宝塔站点目录、对象存储静态托管目录等）。

最小必需文件：

- `index.html`
- `styles.css`
- `app.js`

### 2.3 如果你只想本机快速打开

可直接双击 `index.html` 用浏览器打开（离线也可用，数据仍会保存在本机浏览器 `localStorage`）。

## 可选：在本项目里一键打包 ZIP

如果你希望自己生成一个可分发压缩包：

```bash
./scripts/build-zip.sh
```

输出文件：

- `dist/map-helper-static.zip`

## 本地开发（无构建）

本项目是纯静态文件，任意静态服务器均可运行。
