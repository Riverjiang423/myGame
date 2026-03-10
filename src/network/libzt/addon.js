const path = require('path');

let nativeAddon = null;

function getAddon() {
  if (nativeAddon) {
    return nativeAddon;
  }

  // build/Release/libztaddon.node from node-gyp
  // eslint-disable-next-line global-require, import/no-dynamic-require
  nativeAddon = require(path.join(__dirname, '..', '..', '..', 'build', 'Release', 'libztaddon.node'));
  return nativeAddon;
}

function load(dllPath) {
  return getAddon().load(dllPath);
}

function loaded() {
  return getAddon().loaded();
}

function unload() {
  return getAddon().unload();
}

function nodeStart() {
  return getAddon().nodeStart();
}

function initFromStorage(storagePath) {
  const addon = getAddon();
  if (typeof addon.initFromStorage !== 'function') {
    throw new Error('libzt addon missing initFromStorage(). Please rebuild native addon.');
  }
  return addon.initFromStorage(storagePath);
}

function nodeStop() {
  return getAddon().nodeStop();
}

function netJoin(networkId) {
  return getAddon().netJoin(networkId);
}

function netTransportIsReady(networkId) {
  return getAddon().netTransportIsReady(networkId);
}

function nodeGetId() {
  return getAddon().nodeGetId();
}

function startTcpProxy(options) {
  return getAddon().startTcpProxy(options);
}

function stopTcpProxy() {
  return getAddon().stopTcpProxy();
}

module.exports = {
  load,
  loaded,
  unload,
  initFromStorage,
  nodeStart,
  nodeStop,
  netJoin,
  netTransportIsReady,
  nodeGetId,
  startTcpProxy,
  stopTcpProxy
};
