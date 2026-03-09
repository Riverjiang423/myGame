const {
  startLibztRuntime,
  stopLibztRuntime,
  getLibztState
} = require('../network/libzt/runtime');

async function initLibztMaybe() {
  return startLibztRuntime();
}

async function shutdownLibztMaybe() {
  return stopLibztRuntime();
}

module.exports = {
  startLibztRuntime,
  stopLibztRuntime,
  getLibztState,
  initLibztMaybe,
  shutdownLibztMaybe
};
