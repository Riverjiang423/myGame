function createAppLogger(options = {}) {
  const distributionMode = Boolean(options.distributionMode);

  function status(message) {
    console.log(message);
  }

  function debug(message) {
    if (!distributionMode) {
      console.log(`[debug] ${message}`);
    }
  }

  function warn(message) {
    console.warn(message);
  }

  function error(message) {
    console.error(message);
  }

  return {
    status,
    debug,
    warn,
    error
  };
}

module.exports = {
  createAppLogger
};
