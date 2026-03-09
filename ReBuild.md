# myGame 模块化重构计划（仅计划，不改代码）

## 1. 当前结构分析（现状识别）

当前项目可运行，但核心逻辑主要堆叠在 `index.js`，形成“单文件承担过多职责”的问题。

### 1.1 已存在/可识别模块
- 网络模块（libzt / zerotier）
  - `src/libzt/bootstrap.js`：libzt 启动、入网、代理、关闭
  - `src/libzt/index.js`：native addon JS 包装层
  - `native/libztaddon.cc` + `binding.gyp`：C++ 原生层
  - `start-online.bat` / `online.config.bat`：ZeroTier 客户端联机脚本
  - `start-embedded.bat` / `libzt.config.bat`：libzt 嵌入启动脚本
- HTTP Server / API
  - `index.js`：Express app、静态资源托管、`/api/network-info`、`/api/ping`
- Socket.IO
  - `index.js`：`io` 初始化、所有 `socket.on(...)` 事件绑定
- 房间系统
  - `src/core.js`：`Room` / `Player` / `BaseGame`
  - `index.js`：`rooms` 容器、房间生命周期、owner 切换、断线保活
- 游戏域逻辑
  - `src/MinesweeperGame.js`
  - `src/TexasHoldem.js`
  - `src/Deck.js`

### 1.2 当前主要痛点
- `index.js` 同时承担：配置、网络、API、Socket 事件、房间管理、启动/关闭流程。
- 跨模块依赖方向不清晰（例如 Socket 事件直接操作房间和游戏对象）。
- 配置读取分散在多处 `process.env`，后续扩展（自动联机、打包、自动房间）会越来越难维护。

---

## 2. 推荐目录结构（目标）

```text
src/
  bootstrap/
    app.js
    gracefulShutdown.js
  config/
    env.js
    socket.js
    libzt.js
    app.js
  network/
    libzt/
      runtime.js
      addon.js
    share/
      endpointService.js
  server/
    http/
      createExpressApp.js
      routes/
        ping.route.js
        networkInfo.route.js
      middleware/
    socket/
      createSocketServer.js
      registerSocketHandlers.js
      handlers/
        room.handlers.js
        game.handlers.js
        chat.handlers.js
        session.handlers.js
  room/
    entities/
      Room.js
      Player.js
    repository/
      roomStore.js
    services/
      roomService.js
      roomSnapshotService.js
      roomLifecycleService.js
  game/
    base/
      BaseGame.js
    minesweeper/
      MinesweeperGame.js
    poker/
      TexasHoldem.js
      Deck.js
      pokerBetLimit.js
  api/
    networkInfo.controller.js
    ping.controller.js
index.js
```

说明：
- 根目录 `index.js` 只保留“启动入口”职责（调用 bootstrap）。
- `public/`、`native/`、`*.bat`、`binding.gyp` 继续保留在现有位置。

---

## 3. 模块职责定义

### 3.1 `bootstrap`
- 负责应用启动编排：
  - 加载配置
  - 初始化网络（libzt 可选）
  - 创建 HTTP + Socket 服务
  - 绑定优雅退出（SIGINT/SIGTERM）
- 不承载业务规则。

### 3.2 `network`
- 负责联机通道相关能力：
  - libzt 生命周期（load/start/join/wait/stop/unload）
  - libzt TCP proxy 启停
  - 对外地址推导（public/current/LAN/ZeroTier）
- 不直接处理房间业务和 Socket 事件。

### 3.3 `server`
- `http`：Express 创建、静态资源挂载、API 路由注册。
- `socket`：Socket.IO 初始化、事件注册与鉴权前置。
- 只做传输层与路由层，不放核心房间规则。

### 3.4 `room`
- 房间领域核心：
  - `entities`：Room/Player 数据与基础行为
  - `repository`：全局 `rooms` Map 的读写封装
  - `services`：加入/离开/断线清理/房主转移/快照组装
- 提供清晰接口给 Socket handlers 调用。

### 3.5 `config`
- 唯一配置入口：统一读取 `process.env` 并做默认值/校验。
- 按领域拆分：`app`、`socket`、`libzt`。
- 其他模块禁止直接散读 `process.env`。

---

## 4. 文件迁移清单（当前 -> 目标）

## 4.1 直接移动（物理迁移）
- `src/core.js` -> `src/room/entities/Room.js` + `src/room/entities/Player.js` + `src/game/base/BaseGame.js`
- `src/MinesweeperGame.js` -> `src/game/minesweeper/MinesweeperGame.js`
- `src/TexasHoldem.js` -> `src/game/poker/TexasHoldem.js`
- `src/Deck.js` -> `src/game/poker/Deck.js`
- `src/libzt/bootstrap.js` -> `src/network/libzt/runtime.js`
- `src/libzt/index.js` -> `src/network/libzt/addon.js`

## 4.2 拆分迁移（来自 `index.js`）
- Express app 创建、静态资源挂载 -> `src/server/http/createExpressApp.js`
- `/api/network-info`、`/api/ping` -> `src/server/http/routes/*` + `src/api/*`
- 地址推导（`getShareEndpoints` 等）-> `src/network/share/endpointService.js`
- Socket.IO 初始化参数 -> `src/server/socket/createSocketServer.js`
- Socket 事件注册 -> `src/server/socket/registerSocketHandlers.js`
- 房间相关流程（join/leave/reconnect/owner/cleanup/snapshot）-> `src/room/services/*`
- 游戏事件流转（start/select/action/post_game）-> `src/server/socket/handlers/game.handlers.js`
- 启动与优雅退出（`startServer`/`gracefulShutdown`）-> `src/bootstrap/*`

## 4.3 保持位置不变（本阶段）
- `native/libztaddon.cc`（C++ addon）
- `binding.gyp`
- `start.bat` / `start-online.bat` / `start-embedded.bat`
- `online.config.bat` / `libzt.config.bat`
- `public/index.html` / `public/client.js`

---

## 5. 建议执行顺序（降低风险）

1. 新建 `config` 与 `bootstrap`，让 `index.js` 只做启动代理（行为不变）。
2. 抽出 `network`（libzt + share endpoint），先替换 API 依赖。
3. 抽出 `room`（roomStore + roomService + snapshotService），让 socket handlers 只调 service。
4. 拆 Socket handlers（session/room/chat/game），并集中注册。
5. 最后整理 `game` 目录与导入路径，补基础回归测试（join/leave/reconnect/start_game/game_action）。

---

## 6. 重构完成判定标准（验收）

- 根 `index.js` <= 30 行，仅负责调用 bootstrap。
- `process.env` 读取仅存在于 `src/config/*`。
- `rooms` Map 不再被 socket handler 直接访问，只通过 `roomStore/roomService`。
- libzt 初始化/关闭只在 `network` + `bootstrap` 触发。
- 现有 API 与 Socket 事件名保持兼容（前端无需同步大改）。
