const http = require('http');
const { spawn } = require('child_process');
const { Room, Player } = require('../core');
const { MinesweeperGame } = require('../MinesweeperGame');
const { TexasHoldem } = require('../TexasHoldem');
const { startLibztRuntime, stopLibztRuntime } = require('../network/libzt/runtime');
const { appConfig } = require('../config/app');
const { socketConfig } = require('../config/socket');
const { libztConfig } = require('../config/libzt');
const { createExpressApp } = require('../server/http/createExpressApp');
const { createSocketServer } = require('../server/socket/createSocketServer');
const { registerSocketHandlers } = require('../server/socket/registerSocketHandlers');
const { createRoomStore } = require('../room/repository/roomStore');
const { getDefaultRoomShareInfo } = require('../network/share/endpointService');
const { createAppLogger } = require('./logger');

const app = createExpressApp();
const server = http.createServer(app);

const io = createSocketServer(server);

const roomStore = createRoomStore();
const rooms = roomStore.getRoomMap();
app.locals.roomStore = roomStore;
const DISCONNECT_GRACE_MS = socketConfig.disconnectGraceMs;
const logger = createAppLogger({ distributionMode: appConfig.distributionMode });

function normalizeRoomId(roomId) {
  if (typeof roomId !== 'string') {
    return null;
  }
  const normalized = roomId.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizePlayerToken(playerToken, fallback = null) {
  if (typeof playerToken !== 'string') {
    return fallback;
  }
  const normalized = playerToken.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function isPokerGame(game) {
  return game instanceof TexasHoldem;
}

function getOnlinePlayers(room) {
  return Array.from(room.players.values()).filter((player) => player.online !== false);
}

function getRoomSnapshot(room) {
  const onlinePlayers = getOnlinePlayers(room);
  const onlinePlayerIds = new Set(onlinePlayers.map((p) => p.id));
  const nonOwnerPlayerIds = onlinePlayers
    .map((player) => player.id)
    .filter((id) => id !== room.ownerId);
  const allNonOwnerReady = nonOwnerPlayerIds.every((id) => room.readyPlayerIds.has(id));

  return {
    id: room.id,
    ownerId: room.ownerId,
    selectedGame: room.selectedGame,
    pokerBetLimits: room.pokerBetLimits || { minBet: null, maxBet: null },
    readyPlayerIds: Array.from(room.readyPlayerIds).filter((id) => onlinePlayerIds.has(id)),
    allNonOwnerReady,
    players: onlinePlayers.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color
    })),
    chatHistory: room.chatHistory,
    gameStatus: room.currentGame ? room.currentGame.status : null
  };
}

function parsePokerBetLimits(rawLimits) {
  if (!rawLimits || typeof rawLimits !== 'object') {
    return { minBet: null, maxBet: null };
  }

  const normalize = (value) => {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const num = Number(value);
    if (!Number.isInteger(num) || num <= 0) {
      return NaN;
    }
    return num;
  };

  const minBet = normalize(rawLimits.minBet);
  const maxBet = normalize(rawLimits.maxBet);
  if (Number.isNaN(minBet) || Number.isNaN(maxBet)) {
    return null;
  }
  if (minBet !== null && maxBet !== null && minBet > maxBet) {
    return null;
  }

  return { minBet, maxBet };
}

function broadcastRoomUpdate(room) {
  io.to(room.id).emit('room_update', getRoomSnapshot(room));
}

function getOnlineRoomSockets(room) {
  const sockets = [];
  room.players.forEach((player) => {
    if (player.online === false || !player.socketId) {
      return;
    }
    const socket = io.sockets.sockets.get(player.socketId);
    if (socket) {
      sockets.push(socket);
    }
  });
  return sockets;
}

function emitGameState(room, eventName) {
  if (!room.currentGame) {
    return;
  }

  if (isPokerGame(room.currentGame)) {
    const sockets = getOnlineRoomSockets(room);
    sockets.forEach((s) => {
      const playerId = s.data && s.data.playerId ? s.data.playerId : null;
      s.emit(eventName, {
        type: 'poker',
        state: room.currentGame.getGameState(playerId)
      });
    });
    return;
  }

  io.to(room.id).emit(eventName, {
    type: 'minesweeper',
    state: room.currentGame.getGameState()
  });
}

function emitGameStateToSocket(room, socket, eventName) {
  if (!room.currentGame) {
    return;
  }

  if (isPokerGame(room.currentGame)) {
    socket.emit(eventName, {
      type: 'poker',
      state: room.currentGame.getGameState(socket.data.playerId)
    });
    return;
  }

  socket.emit(eventName, {
    type: 'minesweeper',
    state: room.currentGame.getGameState()
  });
}

function getMinesweeperConfig(payload) {
  const presets = {
    beginner: { width: 9, height: 9, mineCount: 10 },
    intermediate: { width: 16, height: 16, mineCount: 40 },
    advanced: { width: 30, height: 16, mineCount: 99 }
  };

  if (!payload || typeof payload !== 'object') {
    return { width: 10, height: 10, mineCount: 15 };
  }

  const { difficulty, custom } = payload;
  if (difficulty === 'custom' && custom && typeof custom === 'object') {
    const width = Number(custom.width);
    const height = Number(custom.height);
    const mineCount = Number(custom.mineCount);

    const safeWidth = Number.isInteger(width) ? Math.min(Math.max(width, 5), 50) : 10;
    const safeHeight = Number.isInteger(height) ? Math.min(Math.max(height, 5), 30) : 10;
    const maxMines = safeWidth * safeHeight - 1;
    const safeMines = Number.isInteger(mineCount) ? Math.min(Math.max(mineCount, 1), maxMines) : 15;
    return { width: safeWidth, height: safeHeight, mineCount: safeMines };
  }

  if (difficulty && presets[difficulty]) {
    return presets[difficulty];
  }

  return { width: 10, height: 10, mineCount: 15 };
}

function clearDisconnectTimer(player) {
  if (player && player.disconnectCleanupTimer) {
    clearTimeout(player.disconnectCleanupTimer);
    player.disconnectCleanupTimer = null;
  }
}

function transferOwnerIfNeeded(room, preferredOwnerId = null) {
  const onlinePlayers = getOnlinePlayers(room);
  if (onlinePlayers.length === 0) {
    room.ownerId = null;
    return;
  }

  const isCurrentOwnerOnline = onlinePlayers.some((player) => player.id === room.ownerId);
  if (isCurrentOwnerOnline) {
    return;
  }

  if (preferredOwnerId && onlinePlayers.some((player) => player.id === preferredOwnerId)) {
    room.ownerId = preferredOwnerId;
    return;
  }

  room.ownerId = onlinePlayers[0].id;
}

function cleanupOfflinePlayer(room, playerId) {
  const player = room.players.get(playerId);
  if (!player || player.online !== false) {
    return;
  }

  room.removePlayer(playerId);
  if (room.players.size === 0) {
    roomStore.deleteRoom(room.id);
    return;
  }

  transferOwnerIfNeeded(room);
  broadcastRoomUpdate(room);
}

function attachSocketToPlayer(socket, room, player) {
  clearDisconnectTimer(player);
  player.online = true;

  const oldSocketId = player.socketId;
  player.socketId = socket.id;

  if (oldSocketId && oldSocketId !== socket.id) {
    const oldSocket = io.sockets.sockets.get(oldSocketId);
    if (oldSocket) {
      oldSocket.leave(room.id);
      oldSocket.data.roomId = null;
      oldSocket.data.playerId = null;
      oldSocket.emit('action_error', { message: '账号已在其他连接恢复，当前连接已失效' });
    }
  }

  socket.join(room.id);
  socket.data.roomId = room.id;
  socket.data.playerId = player.id;
}

function leaveRoom(socket, reason = 'leave') {
  const roomId = socket.data.roomId;
  const playerId = socket.data.playerId;
  if (!roomId || !roomStore.hasRoom(roomId) || !playerId) {
    return;
  }

  const room = roomStore.getRoom(roomId);
  const player = room.players.get(playerId);
  if (!player) {
    socket.data.roomId = null;
    socket.data.playerId = null;
    socket.leave(roomId);
    return;
  }

  if (reason === 'disconnect') {
    player.online = false;
    player.socketId = null;
    room.readyPlayerIds.delete(playerId);
    transferOwnerIfNeeded(room);

    clearDisconnectTimer(player);
    player.disconnectCleanupTimer = setTimeout(() => {
      cleanupOfflinePlayer(room, playerId);
    }, DISCONNECT_GRACE_MS);

    socket.data.roomId = null;
    socket.data.playerId = null;
    socket.leave(roomId);
    broadcastRoomUpdate(room);
    return;
  }

  clearDisconnectTimer(player);
  room.removePlayer(playerId);

  if (room.players.size === 0) {
    roomStore.deleteRoom(room.id);
  } else {
    transferOwnerIfNeeded(room);
    broadcastRoomUpdate(room);
  }

  socket.data.roomId = null;
  socket.data.playerId = null;
  socket.leave(roomId);
}

registerSocketHandlers({
  io,
  roomStore,
  Room,
  Player,
  TexasHoldem,
  MinesweeperGame,
  normalizeRoomId,
  normalizePlayerToken,
  attachSocketToPlayer,
  broadcastRoomUpdate,
  emitGameStateToSocket,
  getOnlinePlayers,
  getMinesweeperConfig,
  parsePokerBetLimits,
  emitGameState,
  leaveRoom,
  transferOwnerIfNeeded
});

const PORT = appConfig.port;
const HOST = appConfig.host;
let isShuttingDown = false;
let hasAutoOpenedBrowser = false;

function buildAutoOpenUrl(defaultRoomId) {
  const protocol = appConfig.publicProtocol || 'http';
  const host = '127.0.0.1';
  const base = `${protocol}://${host}:${PORT}/`;
  if (!defaultRoomId) {
    return base;
  }
  return `${base}?room=${encodeURIComponent(defaultRoomId)}`;
}

function autoOpenBrowserOnce(url) {
  if (!appConfig.autoOpenBrowser || hasAutoOpenedBrowser || !url) {
    return;
  }

  hasAutoOpenedBrowser = true;

  try {
    if (process.platform === 'win32') {
      const child = spawn('cmd', ['/c', 'start', '', url], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
      return;
    }

    if (process.platform === 'darwin') {
      const child = spawn('open', [url], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
      return;
    }

    const child = spawn('xdg-open', [url], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
  } catch (error) {
    logger.warn(`自动打开浏览器失败：${error.message}`);
  }
}

async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  logger.status(appConfig.distributionMode ? '正在退出服务...' : `Received ${signal}, shutting down...`);

  try {
    await new Promise((resolve) => {
      server.close(() => resolve());
      setTimeout(resolve, 3000);
    });
  } catch (error) {
    // ignore close error
  }

  try {
    await stopLibztRuntime();
  } catch (error) {
    logger.warn(`libzt shutdown warning: ${error.message}`);
  }

  process.exit(0);
}

async function startServer() {
  const startMode = appConfig.startMode;
  const onlineRequired = startMode === 'online-required';

  try {
    logger.status(appConfig.distributionMode ? '应用启动中...' : `运行模式：${appConfig.distributionMode ? 'distribution' : 'development'}`);

    if (startMode === 'local') {
      logger.status('启动模式：local（仅本地模式，跳过联机网络初始化）');
    } else {
      logger.status(`启动模式：${startMode}`);
      if (appConfig.distributionMode) {
        logger.status('正在初始化联机网络...');
      } else {
        logger.debug(
          `正在初始化联机网络（networkId=${libztConfig.networkIdMasked}, source=${libztConfig.networkIdSource}）`
        );
      }
      const libzt = await startLibztRuntime();
      if (libzt.enabled) {
        if (appConfig.distributionMode) {
          logger.status('联机网络已就绪');
        } else {
          logger.debug(
            `联机网络已就绪（nodeId=${libzt.nodeId}, networkId=${libzt.networkIdMasked}, source=${libzt.networkIdSource}）`
          );
        }
        if (libzt.proxy && libzt.proxy.enabled) {
          logger.debug(
            `libzt tcp proxy: zt:${libzt.proxy.listenPort} -> ${libzt.proxy.targetHost}:${libzt.proxy.targetPort}`
          );
        }
      }
    }
  } catch (error) {
    if (onlineRequired || libztConfig.strict) {
      logger.error(`联机初始化失败，当前模式要求联机成功，启动终止：${error.message}`);
      process.exit(1);
      return;
    }
    logger.warn(`联机初始化失败，已回退到本地模式：${error.message}`);
  }

  server.on('error', async (error) => {
    if (error && error.code === 'EADDRINUSE') {
      logger.error(`Port ${PORT} is already in use. Please use another port or stop the existing process.`);
    } else {
      logger.error(`Server error: ${error.message}`);
    }

    try {
      await stopLibztRuntime();
    } catch (shutdownError) {
      // ignore cleanup error
    }

    process.exit(1);
  });

  server.listen(PORT, HOST, () => {
    const defaultRoomResult = roomStore.getOrCreateDefaultRoom(() => new Room());
    const shareInfo = getDefaultRoomShareInfo({
      roomId: defaultRoomResult.room.id,
      protocol: appConfig.publicProtocol || 'http',
      hostHeader: `${HOST}:${PORT}`
    });
    logger.status(`Server listening on http://${HOST}:${PORT}`);
    logger.status(
      `默认房间已就绪：${defaultRoomResult.room.id}${defaultRoomResult.created ? '（新建）' : '（复用）'}`
    );
    if (shareInfo.recommendedShareUrl) {
      logger.status(`推荐分享链接：${shareInfo.recommendedShareUrl}（${shareInfo.recommendedReason}）`);
    }
    const autoOpenUrl = buildAutoOpenUrl(defaultRoomResult.room.id);
    autoOpenBrowserOnce(autoOpenUrl);
  });
}

async function startApp() {
  process.on('SIGINT', () => {
    gracefulShutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    gracefulShutdown('SIGTERM');
  });

  await startServer();
}

module.exports = {
  startApp,
  app,
  server,
  io,
  rooms
};
