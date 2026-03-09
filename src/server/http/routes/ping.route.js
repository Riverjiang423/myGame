const { getPing } = require('../../../api/ping.controller');

function registerPingRoute(app) {
  app.get('/api/ping', getPing);
}

module.exports = {
  registerPingRoute
};
