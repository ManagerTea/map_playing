# 跑团地图助手（服务器共享版）

这是一个**部署在服务器后可被多台电脑共同访问**的跑团工具。所有人看到的是同一张地图和同一组 Token（共享状态保存在服务器 `data/state.json`）。

## 你提到的需求（已支持）

- 地图背景可上传并按百分比缩放，地图可拖动（避免跑到视野外无法操作）。
- Token 可新增多个，可留空名称。
- Token 拖动后会从 A 到 B 做缓动动画。
- Token 可锁定/解锁、编辑、删除，右侧有可展开 Token 列表。
- Token 支持上传图片，默认大小 `100x100px`，并可在创建后随时修改大小。
- 在地图区域可用鼠标滚轮缩放整个界面。
- 地图栏和 Token 栏均可拖动位置。
- 右下角提供“一键隐藏UI/恢复UI”按钮，可隐藏介绍栏与两个控制栏。
- 名字显示支持“常显示 / 悬停显示”总开关。

## 方式一：Docker 部署（推荐）

```bash
docker compose up -d --build
```

访问：

- `http://<服务器IP>:4444`

> `docker-compose.yml` 已将容器 `4444` 端口映射到宿主机 `4444`。

## 方式二：不使用 Docker（压缩包/手动部署）

可以直接下载压缩包并运行，不需要前端构建工具。

### 1) 下载压缩包

代码平台点击：`Code -> Download ZIP`，解压。

### 2) 安装 Node.js（仅服务端运行时）

建议 Node.js 20+。

### 3) 启动

```bash
node server.js
```

也可以使用 `npm start`，但长期运行时推荐直接执行 `node server.js`，避免 npm 包装进程输出版本升级 notice 干扰日志判断。默认监听 `4444` 端口，局域网或公网其他电脑可通过服务器 IP 访问。


## 常见问题：为什么不能访问 `http://0.0.0.0:4444`？

`0.0.0.0` 是服务端监听地址，不是可访问的目标地址。

请这样访问：

- 同一台电脑：`http://localhost:4444` 或 `http://127.0.0.1:4444`
- 其他电脑访问服务器：`http://<服务器局域网IP或公网IP>:4444`

## 可选：一键打包 ZIP

```bash
./scripts/build-zip.sh
```

输出：

- `dist/map-helper-server.zip`

## 目录说明

- `server.js`：HTTP 服务 + 共享状态 API + 图片上传 API
- `app.js`：前端交互逻辑（拖放、动画、同步、滚轮缩放）
- `data/state.json`：共享地图与 Token 状态（运行后自动生成）
- `uploads/`：上传的地图/Token 图片（运行后自动生成）


## Windows / 代理访问时的 `ERR_INVALID_URL` 说明

旧版本服务端会使用请求头里的 `Host` 拼接 URL；如果某些代理、探活工具或异常客户端发来了缺失 `Host` 的请求，Node.js 可能抛出 `TypeError: Invalid URL` 并结束进程。当前版本已改为使用固定本地基准地址解析请求路径，缺失 `Host` 时不会再导致进程崩溃。

## npm notice 说明

如果使用 `npm start` 看到类似 `npm notice New minor version of npm available`，这只是 npm 自身的升级提醒，不是本程序报错。项目已加入 `.npmrc` 关闭 npm 更新提示；如果仍担心 npm 包装进程影响长期运行，建议直接使用：

```bash
node server.js
```

Docker 镜像也已改为直接执行 `node server.js`。

## 公网无法访问排查（端口已放行但仍失败）

如果日志显示服务已启动：

- `Map helper server is listening on 0.0.0.0:4444`

但公网访问 `http://<公网IP>:4444` 仍失败，请按顺序检查：

1. **先在服务器本机验证服务是否存活**

```bash
curl -i http://127.0.0.1:4444/
```

若本机都失败，说明进程未正常监听或已退出。

2. **检查系统防火墙**（很多云服务器除了安全组，还有 OS 防火墙）

```bash
# Ubuntu/Debian
sudo ufw status

# CentOS/RHEL
sudo firewall-cmd --list-ports
```

需要放行 `4444/tcp`。

3. **检查实际监听端口**

```bash
sudo ss -lntp | rg 4444
```

应该看到 `0.0.0.0:4444`（或 Docker 的端口代理进程）。

4. **如果使用 Docker**，确认端口映射是否生效

```bash
docker ps
```

需看到类似 `0.0.0.0:4444->4444/tcp`。

5. **确认云厂商网络 ACL / 实例防火墙 / 安全组同时放行**

仅安全组放行有时不够，VPC ACL 或主机防火墙也可能拦截。

6. **云主机到本机环回正常但公网失败时**，重点看：

- 云平台是否绑定了正确公网 IP/EIP；
- 是否在错误网卡上监听（容器网络、仅内网网卡）；
- 运营商/云平台是否限制高位端口（可临时改 `80/8080` 验证）。

