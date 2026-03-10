# 项目说明（当前实现版）

本项目是一个多人网页游戏房间系统，当前包含：
- 扫雷（多人同房间）
- 德州扑克（含盲压、下注、摊牌、自动下一手）

前后端通信使用 `socket.io`。

## 0. 3 分钟快速上手

### 0.1 开发者本地调试

1. 双击 `setup.bat` 安装依赖  
2. 双击 `start.bat` 启动服务  
3. 浏览器访问控制台打印的地址（默认 `http://127.0.0.1:3000` 或顺延端口）

### 0.2 普通用户分发包启动（免预装 Node）

1. 先执行一次打包准备：`npm run dist:prepare`  
2. 进入 `dist/mygame-win64`  
3. 双击 `launch-product.bat`

### 0.3 发布前最小检查

```bash
npm run release:check
```

如需跳过分发目录检查（仅本机代码验收）：

```bash
RELEASE_CHECK_SKIP_DIST=1 npm run release:check
```

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

## 8. 本地运行与联机（当前）

### 8.1 首次安装依赖

双击：
- `setup.bat`

作用：
- 检查 `node` / `npm`
- 安装依赖（有 `package-lock.json` 时优先 `npm ci`）

### 8.2 本地一键启动（默认）

双击：
- `start.bat`

作用：
- 自动检查环境与依赖
- 自动探测端口（默认从 `3000` 开始，最多顺延 30 个）
- 执行 `npm run dev`

当前默认启动模式（未额外设环境变量）：
- `APP_START_MODE=local`
- 不强依赖 libzt，适合本机开发与联调

### 8.3 ZeroTier 客户端联机（外部客户端方案）

相关文件：
- `online.config.bat`
- `start-online.bat`

步骤：
1. 安装 ZeroTier One 客户端
2. 编辑 `online.config.bat`：
   - `set ZT_NETWORK_ID=<你的网络ID>`
3. 双击 `start-online.bat`

脚本行为：
- 执行 `zerotier-cli join <networkId>`
- 打印 `listnetworks`
- 调用 `start.bat` 启动服务

### 8.4 嵌入式 libzt 方案（Win x64）

相关文件：
- `binding.gyp`
- `native/libztaddon.cc`
- `src/network/libzt/addon.js`
- `src/network/libzt/runtime.js`
- `libzt.config.bat`
- `start-embedded.bat`

准备：
1. 安装 Visual Studio Build Tools（C++ 工具链）
2. 放置 `libzt.dll`：
   - `third_party/libzt/winx64/libzt.dll`
3. 编辑 `libzt.config.bat`（可选覆盖）
4. 双击 `start-embedded.bat`

`start-embedded.bat` 会：
1. 编译原生模块：`npm run build:libzt`
2. 注入 `LIBZT_*` 环境变量
3. 调用 `start.bat` 启动服务

注意：
- 主代码已内置默认官方 `networkId`（`LIBZT_NETWORK_ID` 可覆盖），普通路径不再强制手填。
- 若设置 `LIBZT_STRICT=1`，联机初始化失败会阻止启动。

### 8.5 启动模式说明

- `APP_START_MODE=local`
  - 仅本地模式，跳过联机初始化
- `APP_START_MODE=online-preferred`
  - 尝试联机，失败自动回退本地（默认产品化路径）
- `APP_START_MODE=online-required`
  - 联机失败直接启动失败

可配项：
- `APP_DISTRIBUTION_MODE=1`：产品分发模式（日志更简洁）
- `AUTO_OPEN_BROWSER=1/0`：启动后是否自动打开页面

### 8.6 分享地址与接口

分享地址可基于以下来源自动推导：
- ZeroTier 地址
- LAN 地址
- 当前访问地址 / 固定公网地址

可选环境变量：
- `PUBLIC_PROTOCOL`
- `PUBLIC_HOST`
- `PUBLIC_PORT`
- `SHARE_PORT`

接口：
- `GET /api/network-info?roomId=ABCD`
  - 返回 endpoints、recommendedEndpoint、recommendedReason、recommendedShareUrl
- `GET /api/network-info`
  - 未传 `roomId` 时，使用默认房间信息
- `GET /api/ping`
  - 基础连通性探测（含 CORS 头）

---

## 9. 分发（免预装 Node）

### 9.1 生成分发目录

```bash
npm run dist:prepare
```

生成目录：
- `dist/mygame-win64/app`（应用文件）
- `dist/mygame-win64/runtime`（便携 Node 运行时）
- `dist/mygame-win64/launch-product.bat`（用户入口）

### 9.2 便携 Node 运行时来源

`dist:prepare` 会按优先级查找运行时来源：
1. 环境变量 `NODE_RUNTIME_WIN_X64_DIR`
2. `third_party/node/winx64`

要求存在：
- `node.exe`

### 9.3 用户启动入口

双击：
- `dist/mygame-win64/launch-product.bat`

该脚本默认设置：
- `APP_DISTRIBUTION_MODE=1`
- `APP_START_MODE=online-preferred`
- `AUTO_OPEN_BROWSER=1`

---

## 10. 测试与发布前检查

### 10.1 自动化测试

```bash
npm test
npm run test:unit
npm run test:integration
```

### 10.2 预发布检查

```bash
npm run preflight
# 或
npm run release:check
```

检查内容：
- 依赖与关键源码文件
- 默认配置有效性
- 自动化测试通过
- native 产物存在（`libztaddon.node`、`libzt.dll`）
- 分发目录关键文件存在（含 `runtime/node.exe`）

可选跳过项（CI/分阶段验收）：
- `RELEASE_CHECK_SKIP_TESTS=1`
- `RELEASE_CHECK_SKIP_NATIVE=1`
- `RELEASE_CHECK_SKIP_DIST=1`

### 10.3 手工回归与验收模板

- 手工清单：`docs/manual-regression-checklist.md`
- 报告模板：`docs/release-acceptance-report-template.md`

---

## 11. 关键约束汇总

- 仅房主可：选游戏、开局、扫雷结算控制、设置德州押注上下限
- 非房主必须全部准备后才能开局
- 服务端对关键动作全部做权限与状态校验，不信任前端显示逻辑
- 扫雷人数：`>=1`
- 德州人数：`2-9`
- 德州结算后：自动比牌、分池、下一手
