const path = require('path');
const express = require('express');
const { registerPingRoute } = require('./routes/ping.route');
const { registerNetworkInfoRoute } = require('./routes/networkInfo.route');

function createExpressApp() {
  const app = express();

  app.use(express.static(path.join(__dirname, '..', '..', '..', 'public')));
  registerNetworkInfoRoute(app);
  registerPingRoute(app);

  return app;
}

module.exports = {
  createExpressApp
};
