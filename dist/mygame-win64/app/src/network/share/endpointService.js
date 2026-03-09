const os = require('os');
const { appConfig } = require('../../config/app');

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    return fallback;
  }
  return n;
}

function parseHostHeader(hostHeader) {
  const fallback = {
    hostname: null,
    port: null
  };

  if (!hostHeader || typeof hostHeader !== 'string') {
    return fallback;
  }

  const normalized = hostHeader.trim();
  if (!normalized) {
    return fallback;
  }

  const ipv6Match = normalized.match(/^\[(.+)\](?::(\d+))?$/);
  if (ipv6Match) {
    return {
      hostname: ipv6Match[1],
      port: toPositiveInt(ipv6Match[2], null)
    };
  }

  const parts = normalized.split(':');
  if (parts.length === 2) {
    return {
      hostname: parts[0],
      port: toPositiveInt(parts[1], null)
    };
  }

  return {
    hostname: normalized,
    port: null
  };
}

function shouldShowPort(protocol, port) {
  if (!port) {
    return false;
  }
  if (protocol === 'http' && port === 80) {
    return false;
  }
  if (protocol === 'https' && port === 443) {
    return false;
  }
  return true;
}

function buildShareUrl(protocol, host, port) {
  const safeProtocol = protocol || 'http';
  const hostPart = String(host || '').includes(':') ? `[${host}]` : host;
  const portPart = shouldShowPort(safeProtocol, port) ? `:${port}` : '';
  return `${safeProtocol}://${hostPart}${portPart}`;
}

function buildRoomShareUrl(baseUrl, roomId) {
  if (!baseUrl || !roomId) {
    return null;
  }
  return `${baseUrl}?room=${encodeURIComponent(roomId)}`;
}

function collectNetworkAddresses() {
  const addresses = [];
  const interfaces = os.networkInterfaces();
  Object.keys(interfaces).forEach((ifaceName) => {
    const ifaceList = interfaces[ifaceName] || [];
    ifaceList.forEach((iface) => {
      if (!iface || iface.internal || iface.family !== 'IPv4') {
        return;
      }
      const type = /^zt/i.test(ifaceName) ? 'zerotier' : 'lan';
      const label = type === 'zerotier' ? `ZeroTier 地址 (${ifaceName})` : `LAN 地址 (${ifaceName})`;
      addresses.push({
        type,
        label,
        host: iface.address,
        interface: ifaceName
      });
    });
  });
  return addresses;
}

function resolveShareContext(input) {
  const isReqLike = input && typeof input === 'object' && typeof input.get === 'function';

  const forwardedProto = isReqLike && input.headers && input.headers['x-forwarded-proto']
    ? String(input.headers['x-forwarded-proto']).split(',')[0].trim()
    : '';
  const reqProtocol = isReqLike ? input.protocol : '';
  const optionProtocol = !isReqLike && input && typeof input.protocol === 'string'
    ? input.protocol
    : '';

  const protocol = String(
    appConfig.publicProtocol
    || optionProtocol
    || forwardedProto
    || reqProtocol
    || 'http'
  ).toLowerCase();

  const hostHeader = isReqLike
    ? (input.get('host') || '')
    : (input && typeof input.hostHeader === 'string' ? input.hostHeader : '');

  return {
    protocol,
    hostHeader
  };
}

function getShareEndpoints(input) {
  const ctx = resolveShareContext(input);
  const protocol = ctx.protocol;
  const hostHeader = ctx.hostHeader;
  const parsedHost = parseHostHeader(hostHeader);
  const fallbackPort = appConfig.port;
  const publicHost = appConfig.publicHost || null;
  const publicPort = appConfig.publicPort;
  const sharePort = appConfig.sharePort
    || publicPort
    || parsedHost.port
    || fallbackPort;

  const seen = new Set();
  const endpoints = [];
  const pushEndpoint = (type, label, host, ifaceName = null) => {
    if (!host) {
      return;
    }
    const url = buildShareUrl(protocol, host, sharePort);
    if (seen.has(url)) {
      return;
    }
    seen.add(url);
    endpoints.push({
      type,
      label,
      host,
      port: sharePort,
      interface: ifaceName,
      url
    });
  };

  if (publicHost) {
    pushEndpoint('public', '公网/域名地址', publicHost);
  }

  if (parsedHost.hostname && parsedHost.hostname !== '0.0.0.0' && parsedHost.hostname !== '::') {
    pushEndpoint('current', '当前访问地址', parsedHost.hostname);
  }

  collectNetworkAddresses().forEach((item) => {
    pushEndpoint(item.type, item.label, item.host, item.interface);
  });

  return endpoints;
}

function getRecommendedEndpoint(endpoints, _context = {}) {
  const list = Array.isArray(endpoints) ? endpoints : [];
  if (list.length === 0) {
    return { endpoint: null, reason: '暂无可分享地址' };
  }

  const zerotier = list.find((item) => item.type === 'zerotier') || null;
  if (zerotier) {
    return { endpoint: zerotier, reason: 'ZeroTier 网络可用，优先推荐' };
  }

  const lan = list.find((item) => item.type === 'lan') || null;
  if (lan) {
    return { endpoint: lan, reason: 'ZeroTier 不可用，回退 LAN 地址' };
  }

  const current = list.find((item) => item.type === 'current') || null;
  if (current) {
    return { endpoint: current, reason: 'ZeroTier/LAN 不可用，回退当前访问地址' };
  }

  return { endpoint: list[0], reason: '回退首个可分享地址' };
}

function getDefaultRoomShareInfo(options = {}) {
  const roomId = options.roomId || null;
  const endpoints = getShareEndpoints(options.req || options);
  const recommendation = getRecommendedEndpoint(endpoints, options);
  const recommendedEndpoint = recommendation.endpoint;
  const recommendedReason = recommendation.reason;
  const recommendedShareUrl = recommendedEndpoint
    ? buildRoomShareUrl(recommendedEndpoint.url, roomId)
    : null;

  return {
    roomId,
    recommendedEndpoint,
    recommendedReason,
    endpoints,
    recommendedShareUrl
  };
}

module.exports = {
  collectNetworkAddresses,
  getShareEndpoints,
  getRecommendedEndpoint,
  getDefaultRoomShareInfo
};
