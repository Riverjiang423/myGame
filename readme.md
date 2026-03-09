# 项目说明（当前实现版）

本项目是一个多人网页游戏房间系统，当前包含：
- 扫雷（多人同房间）
- 德州扑克（含盲压、下注、摊牌、自动下一手）

前后端通信使用 `socket.io`。

---

## 1. 视图与状态驱动

前端视图：
- `lobby-view`（大厅）
- `game-view`（扫雷）
- `poker-view`（德州）

切换函数：
- `showView('lobby' | 'minesweeper' | 'poker')`

按钮显示由 `room_update` 驱动：
- 房主且未开局：显示“选择扫雷/选择德州”
- 非房主且已选游戏且未开局：显示“准备/取消准备”
- 房主且已选游戏且未开局：在游戏页显示“开始游戏”
- 开局中（`gameStatus==='playing'`）：隐藏“离开房间”与“开始游戏”

---

## 2. 大厅与房间机制

### 2.1 加入房间

- 按钮：`#join-btn`
- 输入回车：`#player-name-input` / `#room-id-input`
- 客户端发送：
  - `join_room(roomId, playerName, playerToken)`

服务端逻辑：
- 房间号为空则自动创建，否则加入/创建指定房间
- 昵称同房间唯一（重复返回：`该昵称已被使用`）
- 首位在线玩家为房主

### 2.2 重连恢复

客户端本地保存会话：
- `playerToken`
- `playerName`
- `lastRoomId`

连接后自动发送：
- `reconnect_session({ playerToken, roomId, playerName })`

服务端若匹配到旧玩家：
- 重新绑定 socket
- 下发 `room_update`
- 下发 `game_state_update`

### 2.3 离开房间

按钮：
- `#back-btn`（扫雷页，文案“离开房间”）
- `#poker-back-btn`（德州页，文案“离开房间”）
- `#minesweeper-leave-btn`（扫雷结算页，非房主可见）

客户端发送：
- `leave_room()`

服务端：
- 从房间移除玩家
- 清理准备状态
- 如离开者是房主，自动移交房主
- 广播 `room_update`

---

## 3. 房主与准备规则

### 3.1 选择游戏

房主按钮：
- `#start-btn`（选择扫雷）
- `#poker-btn`（选择德州）

客户端发送：
- `select_game('minesweeper' | 'poker')`

服务端：
- 仅房主可选
- 选择后重置当前对局与准备状态

### 3.2 准备

非房主按钮：
- `#room-ready-btn`（大厅）
- `#poker-ready-btn`（德州页）

客户端发送：
- `room_ready_toggle()`

服务端：
- 房主不可准备
- 未选游戏不可准备
- 切换后广播 `room_update`

### 3.3 开始游戏

房主按钮：
- `#game-room-start-btn`（扫雷）
- `#poker-room-start-btn`（德州）

客户端发送：
- 扫雷：`start_game({ type:'minesweeper', difficulty, custom? })`
- 德州：`start_game({ type:'poker', pokerBetLimits })`

服务端校验：
- 仅房主可开始
- `selectedGame` 必须匹配
- 人数限制：
  - 扫雷：`>=1`
  - 德州：`2-9`
- 非房主必须全部已准备

---

## 4. 扫雷机制

### 4.1 难度

- 控件：`#minesweeper-difficulty`
- `custom` 时显示宽/高/雷输入：`#custom-config`

### 4.2 操作

客户端发送 `game_action`：
- 左键：`{ type:'reveal', x, y }`
- 右键：`{ type:'flag', x, y }`
- 双击数字格：`{ type:'chord', x, y }`

服务端安全拦截：
- 游戏已结束时忽略后续 action

### 4.3 结算后操作

按钮：
- `#minesweeper-restart-btn`（房主）
- `#minesweeper-new-round-btn`（房主）
- `#minesweeper-leave-btn`（非房主）

客户端发送：
- `minesweeper_post_game_action('restart'|'new_round')`

服务端：
- 仅房主可 `restart/new_round`
- `restart`：同配置重开
- `new_round`：清空当前对局和已选游戏，回到房间待选状态

---

## 5. 德州扑克机制（当前）

### 5.1 状态流

当前流程：
1. 房主开局后直接进入 `blind` 阶段并发两张底牌（牌背）
2. 盲压仅支持 `fold/call`
3. 盲压结束后进入常规轮：`pre-flop -> flop -> turn -> river`
4. 河牌轮下注结束后自动结算
5. 自动发放底池并自动开始下一手

### 5.2 下注动作

底部按钮：
- `#action-fold` -> `fold`
- `#action-check` -> `check`
- `#action-call` -> `call`
- `#action-raise` -> 动态发送 `bet` 或 `raise`

规则：
- `check` 仅在需跟注额为 0 时允许
- 前端本地拦截：若需跟注 > 0，点“过牌”会提示“不能过牌，请跟注或弃牌”
- `blind` 阶段禁止 `check`

### 5.3 押注上下限（新增）

房主开局前可设置：
- `#poker-min-bet`（最小值）
- `#poker-max-bet`（最大值）
- `#poker-limit-apply-btn`（保存）

客户端发送：
- `set_poker_bet_limits({ minBet, maxBet })`

服务端规则：
- 仅房主可设置
- 仅德州且开局前可设置
- 未设置（留空）表示无限制
- `bet/raise` 都按上下限强校验

### 5.4 摊牌展示（新增）

服务端在结算时下发：
- `lastRoundResult`
  - `winners`
  - `handType`
  - `payout`
  - `communityCards`
  - `playerResults`（每位玩家的最佳五张牌与牌型）

前端展示：
- `#poker-showdown` 区域显示每位玩家“最大手牌组合”
- `#turn-indicator` 显示上一手赢家摘要

### 5.5 手牌可见性

`getGameState(requestingPlayerId)` 中：
- 仅本人且 `canViewHand===true` 才会收到真实手牌
- 其他玩家只看到牌背

---

## 6. 房主移交与断线策略

### 6.1 房主移交

当房主离开或断线：
- 服务端自动顺位移交房主
- 客户端收到后弹 Toast：`房主已变更为：xxx`

### 6.2 断线保留窗口

- 断线后玩家先标记离线并清理 ready
- 进入短暂保留窗口（默认 45 秒，可配）
- 若窗口内通过 `reconnect_session` 恢复，则继续游戏
- 超时未恢复则彻底移出房间

---

## 7. Socket 事件总表

客户端 -> 服务端：
- `reconnect_session(payload)`
- `join_room(roomId, playerName, playerToken)`
- `leave_room()`
- `chat_message(message)`
- `select_game(gameType)`
- `room_ready_toggle()`
- `set_poker_bet_limits({ minBet, maxBet })`
- `start_game(payload)`
- `game_action(actionData)`
- `minesweeper_post_game_action(actionType)`

服务端 -> 客户端：
- `room_update(roomSnapshot)`
- `chat_update(chatHistory)`
- `game_started({ type, state })`
- `game_state_update({ type, state })`
- `action_error({ message })`
- `left_room()`

---

## 8. 本地运行与分发

### 8.1 依赖安装（首次）

双击：
- `setup.bat`

作用：
- 检查 Node.js / npm
- 自动执行 `npm install --include=dev`

### 8.2 一键启动

双击：
- `start.bat`

作用：
- 自动检查环境
- 必要时自动安装依赖
- 自动检测端口占用（默认从 `3000` 开始，最多顺延 30 个端口）
- 执行 `npm run dev`

### 8.3 跨网联机（一键）

新增文件：
- `online.config.bat`
- `start-online.bat`

使用步骤：
1. 安装 ZeroTier One（客户端）
2. 编辑 `online.config.bat`，填写：
   - `ZT_NETWORK_ID=<你的网络ID>`
3. 双击 `start-online.bat`

脚本会：
- 自动执行 `zerotier-cli join <networkId>`
- 打印当前 ZeroTier 网络列表
- 调用 `start.bat` 启动本项目

说明：
- 这是基于 ZeroTier 运行时的快速联机方案。
- 若需“原生 libzt 嵌入（不依赖外部 ZeroTier 客户端）”，需额外接入 libzt SDK/二进制并做 Node 原生绑定。

### 8.4 Win x64 原生嵌入 libzt（新增）

新增文件：
- `binding.gyp`
- `native/libztaddon.cc`
- `src/libzt/index.js`
- `src/libzt/bootstrap.js`
- `libzt.config.bat`
- `start-embedded.bat`

准备步骤（Win x64）：
1. 安装 Visual Studio Build Tools（含 C++ 工具链）
2. 将 `libzt.dll` 放到：
   - `third_party/libzt/winx64/libzt.dll`
3. 编辑 `libzt.config.bat`：
   - `LIBZT_NETWORK_ID=<你的网络ID>`
4. 双击 `start-embedded.bat`

启动脚本会执行：
1. 编译原生模块：`npm run build:libzt`
2. 设置 `LIBZT_*` 环境变量
3. 启动服务（`start.bat` -> `npm run dev`）

服务端启动阶段会：
- 读取 `LIBZT_ENABLE=1`
- 动态加载 `libzt.dll`
- 执行 `zts_node_start` / `zts_net_join`
- 等待网络就绪后再 `server.listen`
- 启动 libzt TCP 代理（默认开启）：`zt:<LIBZT_PROXY_PORT> -> 127.0.0.1:<PORT>`
- 进程退出（SIGINT/SIGTERM）时自动执行 libzt 清理：停代理、停节点、卸载 DLL

相关环境变量：
- `LIBZT_ENABLE`：是否启用嵌入（`1/true`）
- `LIBZT_STRICT`：libzt 初始化失败时是否阻止服务启动（`1` 阻止）
- `LIBZT_NETWORK_ID`：ZeroTier 网络 ID（必填）
- `LIBZT_DLL_PATH`：`libzt.dll` 路径
- `LIBZT_WAIT_MS`：网络就绪等待超时（默认 30000ms）
- `LIBZT_TCP_PROXY_ENABLE`：是否启用 libzt TCP 代理（默认 1）
- `LIBZT_PROXY_PORT`：libzt 侧监听端口（默认 3000）
- `LIBZT_PROXY_TARGET_HOST`：代理目标主机（默认 127.0.0.1）
- `LIBZT_PROXY_MAX_CONNECTIONS`：代理最大并发连接（默认 128）
- `LIBZT_PROXY_IDLE_TIMEOUT_MS`：代理连接空闲超时（默认 120000）
- `LIBZT_PROXY_LOG`：代理日志开关（`1` 输出连接日志）
- `LIBZT_PROXY_ALLOW_IPS`：白名单 IP（逗号分隔，留空表示不限制）
- `APP_PORT_LOCAL`：Node 本地监听端口（`start-embedded.bat` 会写入 `PORT`）
- `DISCONNECT_GRACE_MS`：断线保留时长（默认 `45000`）
- `SOCKET_TRANSPORTS`：Socket.IO 传输顺序（默认 `websocket,polling`）
- `SOCKET_PING_INTERVAL_MS`：服务端心跳间隔（默认 `20000`）
- `SOCKET_PING_TIMEOUT_MS`：服务端心跳超时（默认 `60000`）
- `SOCKET_CONNECT_TIMEOUT_MS`：连接建立超时（默认 `30000`）
- `SOCKET_MAX_HTTP_BUFFER_BYTES`：单消息大小上限（默认 `1000000`）

说明：
- 当前已完成“原生 SDK 加载 + 入网启动 + libzt TCP 代理桥接”链路。
- 业务访问路径为：libzt TCP 端口 -> 本地 Node HTTP/WebSocket。
- 游戏内已增加连接质量提示（自动重连状态 + RTT），用于跨网排障。
- 加入房间后会自动显示“可分享联机地址”（ZeroTier/LAN/当前访问地址）并支持一键复制（复制内容自动附带 `?room=房间号`）。
- 分享地址支持“简洁模式”：仅显示推荐地址。
- 推荐策略已细化：
  - 房主端默认推荐 ZeroTier 地址（无 ZeroTier 时回退 LAN/当前地址）。
  - 非房主端默认推荐“与当前访问来源同网段”的地址（便于同网段直连）。
- 推荐地址旁会显示推荐原因（如“房主优先 ZeroTier”或“同网段匹配”）。
- 每条分享地址会自动做前端连通性检测并显示可达性（可达/不可达 + 延迟）。

新增可选环境变量（分享地址）：
- `PUBLIC_PROTOCOL`：分享链接协议（如 `http` / `https`）
- `PUBLIC_HOST`：固定公网域名/IP（设置后会优先展示）
- `PUBLIC_PORT`：固定分享端口
- `SHARE_PORT`：覆盖分享端口（优先级最高）

新增接口（联机体验）：
- `GET /api/network-info?roomId=ABCD`：返回可分享地址列表
- `GET /api/ping`：返回连通性探测响应（含跨域头）

---

## 9. 关键约束汇总

- 仅房主可：选游戏、开局、扫雷结算控制、设置德州押注上下限
- 非房主必须全部准备后才能开局
- 服务端对关键动作全部做权限与状态校验，不信任前端显示逻辑
- 扫雷人数：`>=1`
- 德州人数：`2-9`
- 德州结算后：自动比牌、分池、下一手
