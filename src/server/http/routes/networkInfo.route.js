const { getNetworkInfo } = require('../../../api/networkInfo.controller');

function registerNetworkInfoRoute(app) {
  app.get('/api/network-info', getNetworkInfo);
}

module.exports = {
  registerNetworkInfoRoute
};
