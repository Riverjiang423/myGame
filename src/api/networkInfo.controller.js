const { getDefaultRoomShareInfo } = require('../network/share/endpointService');

function normalizeRoomId(roomId) {
  if (typeof roomId !== 'string') {
    return null;
  }
  const normalized = roomId.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function getNetworkInfo(req, res) {
  const requestedRoomId = normalizeRoomId(req.query.roomId);
  const roomStore = req && req.app && req.app.locals ? req.app.locals.roomStore : null;
  const roomId = requestedRoomId
    || (roomStore && typeof roomStore.getDefaultRoomId === 'function' ? roomStore.getDefaultRoomId() : null);
  const shareInfo = getDefaultRoomShareInfo({ roomId, req });
  res.json({
    generatedAt: new Date().toISOString(),
    roomId: shareInfo.roomId,
    endpoints: shareInfo.endpoints,
    recommendedEndpoint: shareInfo.recommendedEndpoint,
    recommendedReason: shareInfo.recommendedReason,
    recommendedShareUrl: shareInfo.recommendedShareUrl
  });
}

module.exports = {
  getNetworkInfo
};
