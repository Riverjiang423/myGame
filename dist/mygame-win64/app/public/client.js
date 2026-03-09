const socket = io({
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 8000,
  randomizationFactor: 0.5,
  timeout: 20000
});

const lobbyView = document.getElementById('lobby-view');
const gameView = document.getElementById('game-view');
const pokerView = document.getElementById('poker-view');
const roomCodeEl = document.getElementById('room-code');
const playerListEl = document.getElementById('player-list');
const chatHistoryEl = document.getElementById('chat-history');
const chatInputEl = document.getElementById('chat-input');
const startBtn = document.getElementById('start-btn');
const pokerBtn = document.getElementById('poker-btn');
const backBtn = document.getElementById('back-btn');
const pokerBackBtn = document.getElementById('poker-back-btn');
const gameRoomStartBtn = document.getElementById('game-room-start-btn');
const pokerRoomStartBtn = document.getElementById('poker-room-start-btn');
const statusTextEl = document.getElementById('status-text');
const gridEl = document.getElementById('minesweeper-grid');
const potAmountEl = document.getElementById('pot-amount');
const communityCardsEl = document.getElementById('community-cards');
const pokerSeatsEl = document.getElementById('poker-seats');
const turnIndicatorEl = document.getElementById('turn-indicator');
const pokerShowdownEl = document.getElementById('poker-showdown');
const pokerBetLimitControlsEl = document.getElementById('poker-bet-limit-controls');
const pokerMinBetInputEl = document.getElementById('poker-min-bet');
const pokerMaxBetInputEl = document.getElementById('poker-max-bet');
const pokerLimitApplyBtn = document.getElementById('poker-limit-apply-btn');
const pokerBetLimitStatusEl = document.getElementById('poker-bet-limit-status');
const pokerActionBarEl = document.getElementById('poker-action-bar');
const actionFoldBtn = document.getElementById('action-fold');
const actionCheckBtn = document.getElementById('action-check');
const actionCallBtn = document.getElementById('action-call');
const actionRaiseBtn = document.getElementById('action-raise');
const pokerReadyBtn = document.getElementById('poker-ready-btn');
const joinBtn = document.getElementById('join-btn');
const playerNameInputEl = document.getElementById('player-name-input');
const roomIdInputEl = document.getElementById('room-id-input');
const lobbyStatusEl = document.getElementById('lobby-status');
const lobbyPreJoinEl = document.getElementById('lobby-prejoin');
const lobbyPostJoinEl = document.getElementById('lobby-postjoin');
const myNicknameEl = document.getElementById('my-nickname');
const roomRoleEl = document.getElementById('room-role');
const selectedGameLabelEl = document.getElementById('selected-game-label');
const shareAddressListEl = document.getElementById('share-address-list');
const shareSimpleToggleEl = document.getElementById('share-simple-toggle');
const defaultRoomCodeEl = document.getElementById('default-room-code');
const defaultShareUrlEl = document.getElementById('default-share-url');
const defaultShareReasonEl = document.getElementById('default-share-reason');
const defaultShareCopyBtn = document.getElementById('default-share-copy-btn');
const roomReadyBtn = document.getElementById('room-ready-btn');
const systemToastEl = document.getElementById('system-toast');
const minesweeperPostActionsEl = document.getElementById('minesweeper-post-actions');
const minesweeperRestartBtn = document.getElementById('minesweeper-restart-btn');
const minesweeperNewRoundBtn = document.getElementById('minesweeper-new-round-btn');
const minesweeperLeaveBtn = document.getElementById('minesweeper-leave-btn');
const minesweeperDifficultyEl = document.getElementById('minesweeper-difficulty');
const customConfigEl = document.getElementById('custom-config');
const customWidthEl = document.getElementById('custom-width');
const customHeightEl = document.getElementById('custom-height');
const customMinesEl = document.getElementById('custom-mines');

const STORAGE_KEY = 'mygame.session.v1';
const NETWORK_PING_INTERVAL_MS = 10000;
const SHARE_SIMPLE_MODE_KEY = 'mygame.share.simple.v1';

let currentRoomId = '';
let currentGameStarted = false;
let playerColorById = new Map();
let lastGameState = null;
let joinPendingTimer = null;
let currentSelectedGame = null;
let lastOwnerIdByRoom = new Map();
let toastTimer = null;
let isRoomOwner = false;
let selectGameCooldownUntil = 0;
let currentPokerBetLimits = { minBet: null, maxBet: null };
let reconnectAttemptCount = 0;
let networkPingTimer = null;
let networkStats = {
  connected: false,
  rttMs: null,
  reconnecting: false
};
let lastShareInfoRoomId = '';
let lastShareInfoAt = 0;
let lastShareInfoEndpoints = [];
let shareSimpleMode = localStorage.getItem(SHARE_SIMPLE_MODE_KEY) === '1';
let defaultShareUrl = '';

function ensureNetworkIndicator() {
  if (!lobbyStatusEl || document.getElementById('network-status')) {
    return;
  }
  const indicator = document.createElement('div');
  indicator.id = 'network-status';
  indicator.className = 'mt-2 text-xs font-medium text-[#6e8791]';
  lobbyStatusEl.insertAdjacentElement('afterend', indicator);
}

function updateNetworkIndicator() {
  const indicator = document.getElementById('network-status');
  if (!indicator) {
    return;
  }

  const latencyPart = Number.isFinite(networkStats.rttMs) ? `RTT ${networkStats.rttMs}ms` : 'RTT --';
  const statePart = networkStats.connected
    ? (networkStats.reconnecting ? `重连中（第 ${reconnectAttemptCount} 次）` : '连接稳定')
    : '连接断开';
  indicator.textContent = `网络状态：${statePart} | ${latencyPart}`;
}

function stopNetworkPingLoop() {
  if (networkPingTimer) {
    clearInterval(networkPingTimer);
    networkPingTimer = null;
  }
}

function startNetworkPingLoop() {
  stopNetworkPingLoop();
  networkPingTimer = setInterval(() => {
    if (!socket.connected) {
      return;
    }
    const sentAt = Date.now();
    socket.timeout(4000).emit('client_rtt_ping', sentAt, (err) => {
      if (err) {
        networkStats.rttMs = null;
        updateNetworkIndicator();
        return;
      }
      networkStats.rttMs = Math.max(0, Date.now() - sentAt);
      updateNetworkIndicator();
    });
  }, NETWORK_PING_INTERVAL_MS);
}

const pokerSeatClasses = ['seat-bottom', 'seat-left', 'seat-top', 'seat-right'];

function randomToken() {
  return `P-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getSession() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (typeof parsed !== 'object' || !parsed) {
      throw new Error('invalid session payload');
    }
    return parsed;
  } catch (_error) {
    return {};
  }
}

function saveSession(next) {
  const merged = {
    ...getSession(),
    ...next
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

function ensureSession() {
  const current = getSession();
  if (!current.playerToken) {
    return saveSession({ playerToken: randomToken() });
  }
  return current;
}

function getMyPlayerId() {
  return ensureSession().playerToken;
}

function setLobbyStatus(type, message) {
  if (!lobbyStatusEl) {
    return;
  }
  lobbyStatusEl.classList.remove('info', 'success', 'error');
  lobbyStatusEl.classList.add(type);
  lobbyStatusEl.textContent = message;
}

function withRoomQuery(url, roomId) {
  if (!url || !roomId) {
    return url;
  }
  try {
    const next = new URL(url);
    next.searchParams.set('room', roomId);
    return next.toString();
  } catch (_error) {
    const delimiter = String(url).includes('?') ? '&' : '?';
    return `${url}${delimiter}room=${encodeURIComponent(roomId)}`;
  }
}

function endpointPriority(endpoint, ownerMode = false) {
  if (!endpoint || !endpoint.type) {
    return 999;
  }
  if (ownerMode && endpoint.type === 'zerotier') {
    return 1;
  }
  if (ownerMode && endpoint.type === 'lan') {
    return 2;
  }
  if (ownerMode && endpoint.type === 'current') {
    return 3;
  }
  if (!ownerMode && endpoint.type === 'current') {
    return 1;
  }
  if (!ownerMode && endpoint.type === 'lan') {
    return 2;
  }
  if (!ownerMode && endpoint.type === 'zerotier') {
    return 3;
  }
  if (endpoint.type === 'public') {
    return 4;
  }
  return 99;
}

function extractIPv4(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }
  const match = value.trim().match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/);
  if (!match) {
    return null;
  }
  const ip = match[1];
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return ip;
}

function ipv4Subnet24(ipv4) {
  const ip = extractIPv4(ipv4);
  if (!ip) {
    return null;
  }
  const parts = ip.split('.');
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

function endpointKey(endpoint) {
  if (!endpoint) {
    return '';
  }
  return `${endpoint.type || ''}|${endpoint.host || ''}|${endpoint.url || ''}`;
}

function getRecommendation(endpoints, ownerMode = false, sourceHost = '') {
  if (!Array.isArray(endpoints) || endpoints.length === 0) {
    return { endpoint: null, reason: '' };
  }

  const sourceSubnet = ipv4Subnet24(sourceHost);
  if (ownerMode) {
    const bestZt = endpoints.find((endpoint) => endpoint && endpoint.type === 'zerotier');
    if (bestZt) {
      return { endpoint: bestZt, reason: '房主优先 ZeroTier' };
    }
  } else if (sourceSubnet) {
    const sameSubnet = endpoints.filter((endpoint) => ipv4Subnet24(endpoint && endpoint.host) === sourceSubnet);
    if (sameSubnet.length > 0) {
      const sortedSubnet = [...sameSubnet].sort(
        (a, b) => endpointPriority(a, false) - endpointPriority(b, false)
      );
      return { endpoint: sortedSubnet[0], reason: `同网段匹配（${sourceSubnet}.x）` };
    }
  }

  const sorted = [...endpoints].sort(
    (a, b) => endpointPriority(a, ownerMode) - endpointPriority(b, ownerMode)
  );
  return { endpoint: sorted[0], reason: ownerMode ? '房主默认回退策略' : '默认回退策略' };
}

function getRenderedShareEndpoints(endpoints) {
  if (!Array.isArray(endpoints)) {
    return [];
  }
  const sourceHost = window.location && window.location.hostname ? window.location.hostname : '';
  const ownerMode = Boolean(isRoomOwner);
  const recommendation = getRecommendation(endpoints, ownerMode, sourceHost);
  const recommendedKey = recommendation.endpoint ? endpointKey(recommendation.endpoint) : '';

  if (shareSimpleMode) {
    return recommendation.endpoint ? [recommendation.endpoint] : [];
  }

  const sorted = [...endpoints].sort(
    (a, b) => endpointPriority(a, ownerMode) - endpointPriority(b, ownerMode)
  );
  if (!recommendedKey) {
    return sorted;
  }
  return sorted.sort((a, b) => {
    const aIsRecommended = endpointKey(a) === recommendedKey ? 0 : 1;
    const bIsRecommended = endpointKey(b) === recommendedKey ? 0 : 1;
    return aIsRecommended - bIsRecommended;
  });
}

function updateShareSimpleToggleLabel() {
  if (!shareSimpleToggleEl) {
    return;
  }
  shareSimpleToggleEl.textContent = `简洁模式：${shareSimpleMode ? '开' : '关'}`;
}

function setConnectivityStatus(statusEl, state, text) {
  if (!statusEl) {
    return;
  }
  statusEl.className = 'rounded px-2 py-0.5 text-[10px] font-semibold';
  if (state === 'ok') {
    statusEl.classList.add('bg-[#e9f9f3]', 'text-[#2f7768]');
  } else if (state === 'fail') {
    statusEl.classList.add('bg-[#ffefed]', 'text-[#9a5a53]');
  } else {
    statusEl.classList.add('bg-[#eef7ff]', 'text-[#4e7486]');
  }
  statusEl.textContent = text;
}

async function checkEndpointConnectivity(shareUrl) {
  const url = new URL('/api/ping', shareUrl);
  url.searchParams.set('ts', String(Date.now()));
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2500);
  const startedAt = Date.now();

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      signal: controller.signal
    });
    const latency = Math.max(0, Date.now() - startedAt);
    if (!response.ok) {
      return { ok: false, latency };
    }
    return { ok: true, latency };
  } catch (_error) {
    return { ok: false, latency: null };
  } finally {
    clearTimeout(timeoutId);
  }
}

function runConnectivityChecks() {
  if (!shareAddressListEl) {
    return;
  }
  const rows = shareAddressListEl.querySelectorAll('[data-share-url]');
  rows.forEach(async (row) => {
    const shareUrl = row.getAttribute('data-share-url');
    const statusEl = row.querySelector('[data-connectivity]');
    if (!shareUrl || !statusEl) {
      return;
    }

    setConnectivityStatus(statusEl, 'pending', '检测中...');
    const result = await checkEndpointConnectivity(shareUrl);
    if (result.ok) {
      setConnectivityStatus(statusEl, 'ok', `可达 ${result.latency}ms`);
    } else {
      setConnectivityStatus(statusEl, 'fail', '不可达');
    }
  });
}

function renderShareAddresses(endpoints, roomId) {
  if (!shareAddressListEl) {
    return;
  }

  const sourceHost = window.location && window.location.hostname ? window.location.hostname : '';
  const recommendation = getRecommendation(endpoints, Boolean(isRoomOwner), sourceHost);
  const recommendedKey = recommendation.endpoint ? endpointKey(recommendation.endpoint) : '';
  const renderedEndpoints = getRenderedShareEndpoints(endpoints);
  shareAddressListEl.innerHTML = '';
  if (!Array.isArray(renderedEndpoints) || renderedEndpoints.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = '未检测到可用网卡地址，可手动分享你当前浏览器地址与房间号。';
    shareAddressListEl.appendChild(empty);
    return;
  }

  renderedEndpoints.forEach((endpoint, index) => {
    const row = document.createElement('div');
    row.className = 'rounded-xl border border-[#e1ecef] bg-white px-3 py-2';
    const shareUrl = withRoomQuery(endpoint.url, roomId);
    row.dataset.shareUrl = shareUrl;

    const titleLine = document.createElement('div');
    titleLine.className = 'mb-1 flex flex-wrap items-center justify-between gap-2';
    const titleLeft = document.createElement('div');
    titleLeft.className = 'flex flex-wrap items-center gap-1.5';

    const title = document.createElement('div');
    title.className = 'text-xs font-semibold text-[#4c6773]';
    const recommendedSuffix = endpointKey(endpoint) === recommendedKey ? '（推荐）' : '';
    title.textContent = `${endpoint.label || `地址 ${index + 1}`}${recommendedSuffix}`;
    titleLeft.appendChild(title);

    if (endpointKey(endpoint) === recommendedKey && recommendation.reason) {
      const reason = document.createElement('span');
      reason.className = 'rounded bg-[#f2f8fb] px-2 py-0.5 text-[10px] font-semibold text-[#55717d]';
      reason.textContent = recommendation.reason;
      titleLeft.appendChild(reason);
    }

    const status = document.createElement('span');
    status.dataset.connectivity = '1';
    setConnectivityStatus(status, 'pending', '检测中...');
    titleLine.appendChild(titleLeft);
    titleLine.appendChild(status);

    const line = document.createElement('div');
    line.className = 'flex flex-wrap items-center gap-2';

    const addrText = document.createElement('code');
    addrText.className = 'rounded bg-[#f1f7fa] px-2 py-1 text-[11px] text-[#385463]';
    addrText.textContent = shareUrl;

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'rounded-lg bg-[#e6f4ff] px-2 py-1 text-[11px] font-semibold text-[#355569] hover:brightness-95';
    copyBtn.textContent = '复制';
    copyBtn.dataset.copyText = shareUrl;

    line.appendChild(addrText);
    line.appendChild(copyBtn);
    row.appendChild(titleLine);
    row.appendChild(line);
    shareAddressListEl.appendChild(row);
  });

  runConnectivityChecks();
}

async function copyText(text) {
  if (!text) {
    return false;
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const el = document.createElement('textarea');
  el.value = text;
  el.style.position = 'fixed';
  el.style.left = '-9999px';
  document.body.appendChild(el);
  el.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(el);
  return ok;
}

async function refreshShareAddresses(roomId, force = false) {
  if (!shareAddressListEl || !roomId) {
    return;
  }

  const now = Date.now();
  if (!force && roomId === lastShareInfoRoomId && now - lastShareInfoAt < 30000) {
    return;
  }

  lastShareInfoRoomId = roomId;
  lastShareInfoAt = now;
  shareAddressListEl.innerHTML = '<div>正在获取可分享地址...</div>';

  try {
    const response = await fetch(`/api/network-info?roomId=${encodeURIComponent(roomId)}`, {
      cache: 'no-store'
    });
    if (!response.ok) {
      throw new Error(`network-info ${response.status}`);
    }
    const payload = await response.json();
    lastShareInfoEndpoints = payload && Array.isArray(payload.endpoints) ? payload.endpoints : [];
    renderShareAddresses(lastShareInfoEndpoints, roomId);
  } catch (_error) {
    shareAddressListEl.innerHTML = '<div>地址获取失败，请稍后重试。</div>';
  }
}

async function loadDefaultRoomShareInfo() {
  if (!defaultRoomCodeEl || !defaultShareUrlEl || !defaultShareReasonEl) {
    return;
  }

  defaultRoomCodeEl.textContent = '加载中...';
  defaultShareUrlEl.textContent = '加载中...';
  defaultShareReasonEl.textContent = '正在获取...';
  defaultShareUrl = '';
  if (defaultShareCopyBtn) {
    defaultShareCopyBtn.disabled = true;
  }

  try {
    const response = await fetch('/api/network-info', {
      cache: 'no-store'
    });
    if (!response.ok) {
      throw new Error(`network-info ${response.status}`);
    }
    const payload = await response.json();
    const roomId = payload && payload.roomId ? String(payload.roomId) : '';
    const shareUrl = payload && payload.recommendedShareUrl ? String(payload.recommendedShareUrl) : '';
    const reason = payload && payload.recommendedReason ? String(payload.recommendedReason) : '默认推荐';

    defaultRoomCodeEl.textContent = roomId || '暂无';
    defaultShareUrlEl.textContent = shareUrl || '暂无可分享链接';
    defaultShareReasonEl.textContent = reason;
    defaultShareUrl = shareUrl;

    if (defaultShareCopyBtn) {
      defaultShareCopyBtn.disabled = !Boolean(defaultShareUrl);
      defaultShareCopyBtn.dataset.copyText = defaultShareUrl || '';
    }

    if (roomIdInputEl && !roomIdInputEl.value.trim() && roomId) {
      roomIdInputEl.value = roomId;
    }
  } catch (_error) {
    defaultRoomCodeEl.textContent = '获取失败';
    defaultShareUrlEl.textContent = '请稍后重试';
    defaultShareReasonEl.textContent = '默认房间信息获取失败，不影响手动加入/创建房间';
    defaultShareUrl = '';
    if (defaultShareCopyBtn) {
      defaultShareCopyBtn.disabled = true;
      defaultShareCopyBtn.dataset.copyText = '';
    }
  }
}

function setJoinedLobbyState(isJoined) {
  if (lobbyPreJoinEl) {
    lobbyPreJoinEl.classList.toggle('hidden', isJoined);
  }
  if (lobbyPostJoinEl) {
    lobbyPostJoinEl.classList.toggle('hidden', !isJoined);
  }
}

function showToast(message) {
  if (!systemToastEl) {
    return;
  }
  systemToastEl.textContent = message;
  systemToastEl.classList.remove('hidden');
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastTimer = setTimeout(() => {
    systemToastEl.classList.add('hidden');
  }, 2600);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getGameLabel(gameType) {
  if (gameType === 'minesweeper') {
    return '扫雷';
  }
  if (gameType === 'poker') {
    return '德州扑克';
  }
  return '未选择';
}

function normalizeBetLimitValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    return NaN;
  }
  return num;
}

function parsePokerBetLimitsFromInputs() {
  const minBet = normalizeBetLimitValue(pokerMinBetInputEl ? pokerMinBetInputEl.value.trim() : '');
  const maxBet = normalizeBetLimitValue(pokerMaxBetInputEl ? pokerMaxBetInputEl.value.trim() : '');
  if (Number.isNaN(minBet) || Number.isNaN(maxBet)) {
    return null;
  }
  if (minBet !== null && maxBet !== null && minBet > maxBet) {
    return null;
  }
  return { minBet, maxBet };
}

function formatPokerBetLimits(limits) {
  const minBet = limits && Number.isInteger(limits.minBet) ? limits.minBet : null;
  const maxBet = limits && Number.isInteger(limits.maxBet) ? limits.maxBet : null;
  if (minBet === null && maxBet === null) {
    return '不限';
  }
  if (minBet !== null && maxBet !== null) {
    return `${minBet} - ${maxBet}`;
  }
  if (minBet !== null) {
    return `>= ${minBet}`;
  }
  return `<= ${maxBet}`;
}

function setButtonGroupVisible(buttons, visible) {
  buttons.forEach((btn) => {
    if (!btn) {
      return;
    }
    btn.classList.toggle('hidden', !visible);
  });
}

function configureButtonGroup(buttons, text, disabled) {
  buttons.forEach((btn) => {
    if (!btn) {
      return;
    }
    btn.textContent = text;
    btn.disabled = disabled;
    btn.classList.toggle('opacity-60', disabled);
  });
}

function showView(view) {
  lobbyView.style.display = view === 'lobby' ? 'block' : 'none';
  gameView.style.display = view === 'minesweeper' ? 'block' : 'none';
  pokerView.style.display = view === 'poker' ? 'block' : 'none';
}

function leaveCurrentRoom(message = '正在离开房间...') {
  if (!currentRoomId) {
    showView('lobby');
    return;
  }
  setLobbyStatus('info', message);
  socket.emit('leave_room');
}

function joinRoomFromForm() {
  if (!socket.connected) {
    setLobbyStatus('error', '加入失败：当前连接不可用，请稍后重试');
    return;
  }

  const playerName = (playerNameInputEl?.value || '').trim() || 'Player';
  const roomId = ((roomIdInputEl?.value || '').trim()).toUpperCase();
  const session = ensureSession();
  saveSession({ playerName, lastRoomId: roomId || session.lastRoomId || '' });

  setLobbyStatus('info', '正在加入房间...');
  socket.emit('join_room', roomId, playerName, session.playerToken);

  if (joinPendingTimer) {
    clearTimeout(joinPendingTimer);
  }
  joinPendingTimer = setTimeout(() => {
    setLobbyStatus('error', '加入失败：请求超时，请重试');
  }, 4000);
}

function tryAutoReconnect() {
  const session = ensureSession();
  if (!session.playerToken || !session.lastRoomId) {
    return;
  }

  socket.emit('reconnect_session', {
    playerToken: session.playerToken,
    roomId: session.lastRoomId,
    playerName: session.playerName || ''
  });
}

function isPokerState(gameState) {
  return (
    gameState &&
    Array.isArray(gameState.players) &&
    Array.isArray(gameState.communityCards) &&
    typeof gameState.phase === 'string'
  );
}

function normalizeGamePayload(payload) {
  if (payload && typeof payload === 'object' && payload.state) {
    return {
      type: payload.type || null,
      state: payload.state
    };
  }

  return {
    type: null,
    state: payload
  };
}

function renderPlayers(players) {
  playerColorById = new Map();
  if (!playerListEl) {
    players.forEach((player) => {
      playerColorById.set(player.id, player.color);
    });
    return;
  }

  playerListEl.innerHTML = '';

  players.forEach((player) => {
    playerColorById.set(player.id, player.color);

    const item = document.createElement('li');
    item.className = 'player-item';

    const dot = document.createElement('span');
    dot.className = 'player-dot';
    dot.style.background = player.color;

    const name = document.createElement('span');
    name.textContent = player.name;

    item.appendChild(dot);
    item.appendChild(name);
    playerListEl.appendChild(item);
  });
}

function renderChat(chatList) {
  if (!chatHistoryEl) {
    return;
  }

  chatHistoryEl.innerHTML = '';

  chatList.forEach((entry) => {
    const line = document.createElement('div');
    line.className = 'chat-line';
    line.textContent = `${entry.playerName}: ${entry.message}`;
    chatHistoryEl.appendChild(line);
  });

  chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
}

function renderGameState(gameState) {
  if (!gameState || !Array.isArray(gameState.board)) {
    return;
  }

  lastGameState = gameState;
  gridEl.innerHTML = '';
  statusTextEl.textContent = `状态：${gameState.status}`;

  if (minesweeperPostActionsEl) {
    const ended = gameState.status === 'ended';
    minesweeperPostActionsEl.classList.toggle('hidden', !ended);

    if (minesweeperRestartBtn) {
      minesweeperRestartBtn.disabled = ended ? !isRoomOwner : true;
      minesweeperRestartBtn.classList.toggle('opacity-60', ended ? !isRoomOwner : true);
    }
    if (minesweeperNewRoundBtn) {
      minesweeperNewRoundBtn.disabled = ended ? !isRoomOwner : true;
      minesweeperNewRoundBtn.classList.toggle('opacity-60', ended ? !isRoomOwner : true);
    }
    if (minesweeperLeaveBtn) {
      minesweeperLeaveBtn.classList.toggle('hidden', !(ended && !isRoomOwner));
    }
  }

  const rows = gameState.board.length;
  const cols = rows > 0 ? gameState.board[0].length : 0;
  const cellMinPx = cols >= 30 ? 14 : cols >= 24 ? 16 : cols >= 18 ? 18 : 24;
  const gapPx = cols >= 30 ? 2 : cols >= 24 ? 3 : cols >= 18 ? 4 : 8;
  gridEl.style.gap = `${gapPx}px`;
  gridEl.style.gridTemplateColumns = `repeat(${cols}, minmax(${cellMinPx}px, 1fr))`;
  gridEl.style.minWidth = `${cols * cellMinPx + Math.max(cols - 1, 0) * gapPx}px`;

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const cellData = gameState.board[y][x];
      const cellEl = document.createElement('div');
      cellEl.className = 'cell';
      cellEl.dataset.x = String(cellData.x);
      cellEl.dataset.y = String(cellData.y);

      if (cellData.isRevealed) {
        cellEl.classList.add('revealed');
        if (cellData.isMine) {
          cellEl.classList.add('mine');
          const icon = document.createElement('span');
          icon.className = 'mine-icon';
          cellEl.appendChild(icon);
        } else if (cellData.neighborMines > 0) {
          cellEl.textContent = String(cellData.neighborMines);
        }
      } else if (gameState.status === 'ended' && cellData.isMine) {
        cellEl.classList.add('mine', 'revealed');
        const icon = document.createElement('span');
        icon.className = 'mine-icon';
        cellEl.appendChild(icon);
      } else if (cellData.flaggedBy) {
        cellEl.classList.add('flagged');
        const color = playerColorById.get(cellData.flaggedBy) || '#ff6b6b';
        cellEl.style.borderColor = color;
        cellEl.style.boxShadow = `0 0 0 1px ${color}44`;
        cellEl.textContent = 'F';
      }

      gridEl.appendChild(cellEl);
    }
  }
}

function cardToLabel(card) {
  if (!card || typeof card !== 'object') {
    return '?';
  }
  const suitSymbolMap = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠'
  };
  const symbol = suitSymbolMap[card.suit] || '?';
  return `${card.rank || '?'}${symbol}`;
}

function isRedSuit(card) {
  return card && (card.suit === 'hearts' || card.suit === 'diamonds');
}

function renderPokerState(gameState) {
  if (!isPokerState(gameState)) {
    return;
  }

  lastGameState = gameState;
  showView('poker');

  potAmountEl.textContent = String(gameState.pot || 0);
  if (gameState.lastRoundResult && gameState.lastRoundResult.winners) {
    const winners = gameState.lastRoundResult.winners.map((w) => w.name).join('、');
    turnIndicatorEl.textContent = `上一手：${gameState.lastRoundResult.handType}，赢家 ${winners}`;
  }
  if (pokerShowdownEl) {
    const result = gameState.lastRoundResult;
    if (result && Array.isArray(result.playerResults) && result.playerResults.length > 0) {
      const lines = result.playerResults.map((row) => {
        const cards = Array.isArray(row.bestCards) && row.bestCards.length > 0
          ? row.bestCards.map((card) => cardToLabel(card)).join(' ')
          : '—';
        const winnerMark = row.isWinner ? '（赢家）' : '';
        return `<div class=\"py-0.5\"><strong>${escapeHtml(row.name)}</strong>${winnerMark}：${escapeHtml(row.handType || '已弃牌')} | ${escapeHtml(cards)}</div>`;
      });
      pokerShowdownEl.innerHTML = `<div class=\"mb-1 font-semibold text-[#3e5966]\">上一手最大牌型展示（公共牌组合后）</div>${lines.join('')}`;
      pokerShowdownEl.classList.remove('hidden');
    } else {
      pokerShowdownEl.classList.add('hidden');
      pokerShowdownEl.innerHTML = '';
    }
  }
  communityCardsEl.innerHTML = '';

  gameState.communityCards.forEach((card) => {
    const cardEl = document.createElement('div');
    cardEl.className = `playing-card${isRedSuit(card) ? ' red' : ''}`;
    cardEl.textContent = cardToLabel(card);
    communityCardsEl.appendChild(cardEl);
  });

  pokerSeatsEl.innerHTML = '';
  const players = gameState.players || [];
  const myPlayerId = getMyPlayerId();
  const myPlayerIndex = players.findIndex((player) => player.id === myPlayerId);
  const seatAnchorIndex = myPlayerIndex >= 0 ? myPlayerIndex : 0;

  players.forEach((player, index) => {
    const relativeSeatIndex = (index - seatAnchorIndex + players.length) % players.length;
    const seatEl = document.createElement('div');
    seatEl.className = `player-seat ${pokerSeatClasses[relativeSeatIndex % pokerSeatClasses.length]}`;

    const nameEl = document.createElement('div');
    nameEl.className = 'seat-name';
    nameEl.textContent = player.id === myPlayerId ? `${player.name} (你)` : player.name;

    const metaEl = document.createElement('div');
    metaEl.className = 'seat-meta';
    const chipsEl = document.createElement('span');
    chipsEl.textContent = String(player.chips);
    const actionEl = document.createElement('span');
    actionEl.textContent = player.lastAction || '-';
    metaEl.appendChild(chipsEl);
    metaEl.appendChild(actionEl);

    const cardsEl = document.createElement('div');
    cardsEl.className = 'seat-cards';

    const hand = Array.isArray(player.hand) ? player.hand : [];
    if (player.id === myPlayerId && hand.length > 0) {
      hand.forEach((card) => {
        const cardEl = document.createElement('div');
        cardEl.className = `playing-card${isRedSuit(card) ? ' red' : ''}`;
        cardEl.textContent = cardToLabel(card);
        cardsEl.appendChild(cardEl);
      });
      while (cardsEl.children.length < 2) {
        const emptyCard = document.createElement('div');
        emptyCard.className = 'playing-card';
        emptyCard.textContent = '?';
        cardsEl.appendChild(emptyCard);
      }
    } else {
      for (let i = 0; i < 2; i += 1) {
        const back = document.createElement('div');
        back.className = 'card-back';
        cardsEl.appendChild(back);
      }
    }

    seatEl.appendChild(nameEl);
    seatEl.appendChild(metaEl);
    seatEl.appendChild(cardsEl);
    pokerSeatsEl.appendChild(seatEl);
  });

  const isBlindPhase = gameState.phase === 'blind';
  const isGameEnded = gameState.status === 'ended' || gameState.phase === 'showdown';
  const myPlayerIdForTurn = getMyPlayerId();
  const isMyTurn = gameState.currentTurnPlayerId === myPlayerIdForTurn;
  const hasExistingBet = Number(gameState.currentBet || 0) > 0;
  if (isGameEnded) {
    pokerActionBarEl.classList.add('hidden');
    turnIndicatorEl.textContent = '本局已结束，等待房主重新开始或离开房间';
    return;
  }

  if (isMyTurn) {
    pokerActionBarEl.classList.remove('hidden', 'disabled');
    pokerActionBarEl.classList.add('active-turn');
    if (isBlindPhase) {
      actionFoldBtn.style.display = '';
      actionCallBtn.style.display = '';
      actionCheckBtn.style.display = 'none';
      actionRaiseBtn.style.display = 'none';
      actionCallBtn.textContent = `盲压 ${gameState.blindAmount || 20}`;
      turnIndicatorEl.textContent = '盲压阶段：选择弃牌或参与盲压';
    } else {
      actionFoldBtn.style.display = '';
      actionCallBtn.style.display = '';
      actionCheckBtn.style.display = '';
      actionRaiseBtn.style.display = '';
      actionRaiseBtn.textContent = hasExistingBet ? '加注' : '下注';
      actionCallBtn.textContent = '跟注';
      turnIndicatorEl.textContent = '轮到你行动';
    }
  } else {
    pokerActionBarEl.classList.remove('active-turn');
    pokerActionBarEl.classList.add('hidden');
    if (isBlindPhase) {
      turnIndicatorEl.textContent = '盲压阶段：等待其他玩家选择';
    } else {
      actionCallBtn.textContent = '跟注';
      actionFoldBtn.style.display = '';
      actionCallBtn.style.display = '';
      actionCheckBtn.style.display = '';
      actionRaiseBtn.style.display = '';
      actionRaiseBtn.textContent = hasExistingBet ? '加注' : '下注';
      turnIndicatorEl.textContent = gameState.currentTurnPlayerId
        ? '等待其他玩家行动'
        : '等待本轮开始';
    }
  }
}

socket.on('connect', () => {
  reconnectAttemptCount = 0;
  networkStats.connected = true;
  networkStats.reconnecting = false;
  updateNetworkIndicator();
  startNetworkPingLoop();

  const session = ensureSession();
  if (playerNameInputEl && !playerNameInputEl.value.trim()) {
    playerNameInputEl.value = session.playerName || 'Player';
  }

  setLobbyStatus('info', '已连接服务器，正在尝试恢复会话...');
  tryAutoReconnect();
});

socket.on('connect_error', () => {
  networkStats.connected = false;
  networkStats.reconnecting = true;
  networkStats.rttMs = null;
  updateNetworkIndicator();
  setLobbyStatus('error', '连接失败：无法连接到服务器');
});

socket.on('disconnect', () => {
  networkStats.connected = false;
  networkStats.reconnecting = true;
  networkStats.rttMs = null;
  stopNetworkPingLoop();
  updateNetworkIndicator();
  setLobbyStatus('error', '连接断开：正在等待重连...');
});

socket.io.on('reconnect_attempt', (attempt) => {
  reconnectAttemptCount = attempt;
  networkStats.reconnecting = true;
  updateNetworkIndicator();
});

socket.io.on('reconnect', () => {
  reconnectAttemptCount = 0;
  networkStats.connected = true;
  networkStats.reconnecting = false;
  updateNetworkIndicator();
  startNetworkPingLoop();
});

socket.on('left_room', () => {
  currentRoomId = '';
  currentSelectedGame = null;
  currentGameStarted = false;
  lastGameState = null;
  lastShareInfoRoomId = '';
  lastShareInfoAt = 0;
  lastShareInfoEndpoints = [];
  if (shareAddressListEl) {
    shareAddressListEl.innerHTML = '<div>加入房间后将显示可分享地址。</div>';
  }
  setJoinedLobbyState(false);
  showView('lobby');
  saveSession({ lastRoomId: '' });
  setLobbyStatus('info', '已离开房间');
});

socket.on('room_update', (room) => {
  if (!room) {
    return;
  }

  const players = Array.isArray(room.players) ? room.players : [];
  const readyPlayerIds = new Set(Array.isArray(room.readyPlayerIds) ? room.readyPlayerIds : []);
  const previousOwnerId = lastOwnerIdByRoom.get(room.id) || null;
  if (previousOwnerId && room.ownerId && previousOwnerId !== room.ownerId) {
    const newOwner = players.find((player) => player.id === room.ownerId);
    const newOwnerName = newOwner ? newOwner.name : '未知玩家';
    showToast(`房主已变更为：${newOwnerName}`);
  }
  if (room.ownerId) {
    lastOwnerIdByRoom.set(room.id, room.ownerId);
  }

  const myPlayerId = getMyPlayerId();
  const isOwner = room.ownerId === myPlayerId;
  isRoomOwner = isOwner;
  const gameInProgress = room.gameStatus === 'playing';
  currentGameStarted = gameInProgress;
  currentRoomId = room.id;
  currentSelectedGame = room.selectedGame || null;
  currentPokerBetLimits = room.pokerBetLimits || { minBet: null, maxBet: null };
  roomCodeEl.textContent = room.id;
  refreshShareAddresses(room.id);
  renderPlayers(players);
  setJoinedLobbyState(true);

  const me = players.find((player) => player.id === myPlayerId);
  if (me) {
    saveSession({ playerName: me.name, lastRoomId: room.id });
    if (playerNameInputEl) {
      playerNameInputEl.value = me.name;
    }
  }
  if (myNicknameEl) {
    myNicknameEl.textContent = me ? me.name : ((playerNameInputEl && playerNameInputEl.value.trim()) || 'Player');
  }
  if (roomRoleEl) {
    roomRoleEl.textContent = isOwner ? '房主' : '玩家';
  }
  if (selectedGameLabelEl) {
    selectedGameLabelEl.textContent = getGameLabel(currentSelectedGame);
  }

  const lobbyReadyButtons = [roomReadyBtn];
  const pokerReadyButtons = [pokerReadyBtn];
  const readyButtons = [roomReadyBtn, pokerReadyBtn];
  const startButtons = [gameRoomStartBtn, pokerRoomStartBtn];
  const selectMinesweeperButtons = [startBtn];
  const selectPokerButtons = [pokerBtn];

  const showSelectButtons = isOwner && !gameInProgress;
  setButtonGroupVisible(selectMinesweeperButtons, showSelectButtons);
  setButtonGroupVisible(selectPokerButtons, showSelectButtons);

  const showReadyControls = Boolean(room.selectedGame) && !gameInProgress;
  setButtonGroupVisible(lobbyReadyButtons, showReadyControls && !isOwner && room.selectedGame !== 'poker');
  setButtonGroupVisible(pokerReadyButtons, showReadyControls && !isOwner && room.selectedGame === 'poker');
  setButtonGroupVisible(startButtons, showReadyControls && isOwner);
  setButtonGroupVisible([backBtn, pokerBackBtn], !gameInProgress);
  setButtonGroupVisible([pokerBetLimitControlsEl], isOwner && !gameInProgress && room.selectedGame === 'poker');
  if (pokerBetLimitStatusEl) {
    pokerBetLimitStatusEl.textContent = `押注限制：${formatPokerBetLimits(currentPokerBetLimits)}`;
  }
  if (pokerMinBetInputEl && pokerMaxBetInputEl && isOwner && !gameInProgress && room.selectedGame === 'poker') {
    pokerMinBetInputEl.value = Number.isInteger(currentPokerBetLimits.minBet) ? String(currentPokerBetLimits.minBet) : '';
    pokerMaxBetInputEl.value = Number.isInteger(currentPokerBetLimits.maxBet) ? String(currentPokerBetLimits.maxBet) : '';
  }

  const isReady = readyPlayerIds.has(myPlayerId);
  configureButtonGroup(readyButtons, isReady ? '取消准备' : '准备', !room.selectedGame);
  const canStartByGame = (() => {
    if (!room.selectedGame) {
      return false;
    }
    if (room.selectedGame === 'minesweeper') {
      return players.length >= 1;
    }
    if (room.selectedGame === 'poker') {
      return players.length >= 2 && players.length <= 9;
    }
    return false;
  })();
  const canStart = canStartByGame && Boolean(room.allNonOwnerReady);
  configureButtonGroup(startButtons, '开始游戏', !canStart);

  if (room.selectedGame === 'minesweeper') {
    showView('minesweeper');
  } else if (room.selectedGame === 'poker') {
    showView('poker');
  } else {
    lastGameState = null;
    showView('lobby');
  }

  if (joinPendingTimer) {
    clearTimeout(joinPendingTimer);
    joinPendingTimer = null;
  }

  if (isOwner) {
    const readyCount = readyPlayerIds.size;
    const totalNonOwner = Math.max(players.length - 1, 0);
    const unreadyPlayers = players
      .filter((player) => player.id !== room.ownerId && !readyPlayerIds.has(player.id))
      .map((player) => player.name);

    if (unreadyPlayers.length > 0) {
      setLobbyStatus(
        'info',
        `已加入房间 ${room.id}（已准备 ${readyCount}/${totalNonOwner}，未准备：${unreadyPlayers.join('、')}）`
      );
    } else {
      setLobbyStatus('success', `已加入房间 ${room.id}（已准备 ${readyCount}/${totalNonOwner}，全部已准备）`);
    }
  } else if (!room.selectedGame) {
    setLobbyStatus('info', '等待房主选择游戏');
  } else {
    const myReady = readyPlayerIds.has(myPlayerId);
    setLobbyStatus(myReady ? 'success' : 'info', myReady ? '你已准备，等待房主开始游戏' : '请先点击准备');
  }
});

socket.on('chat_update', (chatList) => {
  renderChat(Array.isArray(chatList) ? chatList : []);
});

socket.on('action_error', (payload) => {
  const message = payload && payload.message ? payload.message : '操作失败，请重试';
  setLobbyStatus('error', `操作失败：${message}`);
});

socket.on('game_started', (payload) => {
  const normalized = normalizeGamePayload(payload);
  setButtonGroupVisible([backBtn, pokerBackBtn], false);
  setButtonGroupVisible([gameRoomStartBtn, pokerRoomStartBtn], false);

  if (normalized.type === 'poker') {
    showView('poker');
  } else {
    showView('minesweeper');
  }

  if (normalized.state) {
    if (isPokerState(normalized.state)) {
      renderPokerState(normalized.state);
    } else {
      renderGameState(normalized.state);
    }
  }
});

socket.on('game_state_update', (payload) => {
  const normalized = normalizeGamePayload(payload);
  if (normalized.type === 'poker' || isPokerState(normalized.state)) {
    renderPokerState(normalized.state);
    return;
  }
  renderGameState(normalized.state);
});

const selectMinesweeperButtons = [startBtn];
selectMinesweeperButtons.forEach((btn) => {
  if (!btn) {
    return;
  }
  btn.addEventListener('click', () => {
    const now = Date.now();
    if (now < selectGameCooldownUntil) {
      return;
    }
    if (currentSelectedGame === 'minesweeper' && !currentGameStarted) {
      return;
    }

    selectGameCooldownUntil = now + 400;
    socket.emit('select_game', 'minesweeper');
  });
});

const selectPokerButtons = [pokerBtn];
selectPokerButtons.forEach((btn) => {
  if (!btn) {
    return;
  }
  btn.addEventListener('click', () => {
    const now = Date.now();
    if (now < selectGameCooldownUntil) {
      return;
    }
    if (currentSelectedGame === 'poker' && !currentGameStarted) {
      return;
    }

    selectGameCooldownUntil = now + 400;
    socket.emit('select_game', 'poker');
  });
});

const roomReadyButtons = [roomReadyBtn, pokerReadyBtn];
roomReadyButtons.forEach((btn) => {
  if (!btn) {
    return;
  }
  btn.addEventListener('click', () => {
    socket.emit('room_ready_toggle');
  });
});

const roomStartButtons = [gameRoomStartBtn, pokerRoomStartBtn];
roomStartButtons.forEach((btn) => {
  if (!btn) {
    return;
  }
  btn.addEventListener('click', () => {
    if (!currentSelectedGame) {
      return;
    }

    if (currentSelectedGame === 'minesweeper') {
      const difficulty = minesweeperDifficultyEl ? minesweeperDifficultyEl.value : 'beginner';
      const payload = {
        type: 'minesweeper',
        difficulty
      };

      if (difficulty === 'custom') {
        payload.custom = {
          width: Number(customWidthEl.value),
          height: Number(customHeightEl.value),
          mineCount: Number(customMinesEl.value)
        };
      }

      socket.emit('start_game', payload);
      return;
    }

    if (currentSelectedGame === 'poker') {
      const limits = parsePokerBetLimitsFromInputs();
      if (!limits) {
        setLobbyStatus('error', '押注上下限设置无效');
        return;
      }
      socket.emit('start_game', { type: 'poker', pokerBetLimits: limits });
      return;
    }

    socket.emit('start_game', { type: currentSelectedGame });
  });
});

if (joinBtn) {
  joinBtn.addEventListener('click', () => {
    joinRoomFromForm();
  });
}

if (playerNameInputEl) {
  playerNameInputEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      joinRoomFromForm();
    }
  });
}

if (roomIdInputEl) {
  roomIdInputEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      joinRoomFromForm();
    }
  });
}

if (chatInputEl) {
  chatInputEl.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }

    const message = chatInputEl.value.trim();
    if (!message) {
      return;
    }

    socket.emit('chat_message', message);
    chatInputEl.value = '';
  });
}

if (backBtn) {
  backBtn.addEventListener('click', () => {
    leaveCurrentRoom('正在离开房间...');
  });
}

if (pokerBackBtn) {
  pokerBackBtn.addEventListener('click', () => {
    leaveCurrentRoom('正在离开房间...');
  });
}

if (minesweeperLeaveBtn) {
  minesweeperLeaveBtn.addEventListener('click', () => {
    leaveCurrentRoom('正在离开房间...');
  });
}

gridEl.addEventListener('click', (event) => {
  const cell = event.target.closest('.cell');
  if (!cell || !gridEl.contains(cell)) {
    return;
  }

  if (lastGameState && lastGameState.status === 'ended') {
    return;
  }

  socket.emit('game_action', {
    type: 'reveal',
    x: Number(cell.dataset.x),
    y: Number(cell.dataset.y)
  });
});

gridEl.addEventListener('dblclick', (event) => {
  const cell = event.target.closest('.cell');
  if (!cell || !gridEl.contains(cell)) {
    return;
  }

  if (lastGameState && lastGameState.status === 'ended') {
    return;
  }

  socket.emit('game_action', {
    type: 'chord',
    x: Number(cell.dataset.x),
    y: Number(cell.dataset.y)
  });
});

gridEl.addEventListener('contextmenu', (event) => {
  const cell = event.target.closest('.cell');
  if (!cell || !gridEl.contains(cell)) {
    return;
  }

  event.preventDefault();

  if (lastGameState && lastGameState.status === 'ended') {
    return;
  }

  socket.emit('game_action', {
    type: 'flag',
    x: Number(cell.dataset.x),
    y: Number(cell.dataset.y)
  });
});

actionFoldBtn.addEventListener('click', () => {
  socket.emit('game_action', { type: 'fold' });
});

actionCheckBtn.addEventListener('click', () => {
  if (isPokerState(lastGameState)) {
    const me = (lastGameState.players || []).find((p) => p.id === getMyPlayerId());
    if (me) {
      const needToCall = Math.max(0, Number(lastGameState.currentBet || 0) - Number(me.currentBet || 0));
      if (needToCall > 0) {
        const msg = `当前你的下注小于跟注值（还需 ${needToCall}），不能过牌，请选择跟注或弃牌`;
        showToast(msg);
        setLobbyStatus('error', msg);
        return;
      }
    }
  }
  socket.emit('game_action', { type: 'check' });
});

actionCallBtn.addEventListener('click', () => {
  socket.emit('game_action', { type: 'call' });
});

actionRaiseBtn.addEventListener('click', () => {
  if (!isPokerState(lastGameState)) {
    return;
  }

  const me = (lastGameState.players || []).find((p) => p.id === getMyPlayerId());
  if (!me) {
    return;
  }

  const currentBet = Number(lastGameState.currentBet || 0);
  const actionType = currentBet > 0 ? 'raise' : 'bet';
  const limit = lastGameState.betLimit || { minBet: null, maxBet: null };
  const playerBet = Number(me.currentBet || 0);
  const callAmount = Math.max(0, currentBet - playerBet);
  const limitMin = Number.isInteger(limit.minBet) ? limit.minBet : 1;
  const limitMax = Number.isInteger(limit.maxBet) ? limit.maxBet : Number.MAX_SAFE_INTEGER;
  const minRaise = Math.max(1, limitMin);
  const maxRaise = Math.min(Math.max(0, Number(me.chips || 0) - callAmount), limitMax);
  if (maxRaise <= 0) {
    setLobbyStatus('error', '加注失败：可用筹码不足');
    return;
  }

  const label = actionType === 'raise' ? '加注' : '下注';
  const raw = window.prompt(`输入${label}金额（最小 ${minRaise}，最大 ${maxRaise}）`, String(minRaise));
  if (raw === null) {
    return;
  }

  const safeRaw = raw.replace(/[^\d]/g, '');
  const amount = Number(safeRaw);
  if (!Number.isFinite(amount) || amount < minRaise || amount > maxRaise) {
    setLobbyStatus('error', `${label}失败：金额需在 ${minRaise}-${maxRaise} 之间`);
    return;
  }

  socket.emit('game_action', { type: actionType, amount });
});

if (pokerLimitApplyBtn) {
  pokerLimitApplyBtn.addEventListener('click', () => {
    const limits = parsePokerBetLimitsFromInputs();
    if (!limits) {
      setLobbyStatus('error', '押注上下限设置无效');
      return;
    }
    socket.emit('set_poker_bet_limits', limits);
  });
}

if (shareAddressListEl) {
  shareAddressListEl.addEventListener('click', async (event) => {
    const btn = event.target.closest('button[data-copy-text]');
    if (!btn) {
      return;
    }
    const text = btn.dataset.copyText || '';
    try {
      const ok = await copyText(text);
      if (!ok) {
        throw new Error('copy failed');
      }
      showToast('联机地址已复制');
      setLobbyStatus('success', '联机地址已复制，可直接发给好友');
    } catch (_error) {
      setLobbyStatus('error', '复制失败，请手动选中文本复制');
    }
  });
}

if (shareSimpleToggleEl) {
  shareSimpleToggleEl.addEventListener('click', () => {
    shareSimpleMode = !shareSimpleMode;
    localStorage.setItem(SHARE_SIMPLE_MODE_KEY, shareSimpleMode ? '1' : '0');
    updateShareSimpleToggleLabel();
    if (currentRoomId) {
      renderShareAddresses(lastShareInfoEndpoints, currentRoomId);
    }
  });
}

if (defaultShareCopyBtn) {
  defaultShareCopyBtn.addEventListener('click', async () => {
    const text = defaultShareCopyBtn.dataset.copyText || defaultShareUrl;
    if (!text) {
      setLobbyStatus('error', '暂无可复制的分享链接');
      return;
    }
    try {
      const ok = await copyText(text);
      if (!ok) {
        throw new Error('copy failed');
      }
      showToast('分享链接已复制');
      setLobbyStatus('success', '默认房间分享链接已复制');
    } catch (_error) {
      setLobbyStatus('error', '复制失败，请手动选中文本复制');
    }
  });
}

if (minesweeperDifficultyEl && customConfigEl) {
  minesweeperDifficultyEl.addEventListener('change', () => {
    customConfigEl.classList.toggle('show', minesweeperDifficultyEl.value === 'custom');
  });
}

if (minesweeperRestartBtn) {
  minesweeperRestartBtn.addEventListener('click', () => {
    socket.emit('minesweeper_post_game_action', 'restart');
  });
}

if (minesweeperNewRoundBtn) {
  minesweeperNewRoundBtn.addEventListener('click', () => {
    socket.emit('minesweeper_post_game_action', 'new_round');
  });
}

ensureSession();
ensureNetworkIndicator();
updateNetworkIndicator();
updateShareSimpleToggleLabel();
loadDefaultRoomShareInfo();
if (shareAddressListEl) {
  shareAddressListEl.innerHTML = '<div>加入房间后将显示可分享地址。</div>';
}

if (roomIdInputEl) {
  const roomFromQuery = new URLSearchParams(window.location.search).get('room');
  if (roomFromQuery && !roomIdInputEl.value.trim()) {
    roomIdInputEl.value = String(roomFromQuery).trim().toUpperCase();
  }
}
setJoinedLobbyState(false);
showView('lobby');
