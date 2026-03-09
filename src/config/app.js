const { readStringEnv, readIntEnv, readBoolEnv } = require('./env');

function normalizeStartMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'local' || normalized === 'online-required' || normalized === 'online-preferred') {
    return normalized;
  }
  return 'online-preferred';
}

const distributionMode = readBoolEnv('APP_DISTRIBUTION_MODE', false);
const hasStartModeOverride = process.env.APP_START_MODE !== undefined
  && process.env.APP_START_MODE !== null
  && String(process.env.APP_START_MODE).trim() !== '';
const hasAutoOpenOverride = process.env.AUTO_OPEN_BROWSER !== undefined
  && process.env.AUTO_OPEN_BROWSER !== null
  && String(process.env.AUTO_OPEN_BROWSER).trim() !== '';
const defaultStartMode = distributionMode ? 'online-preferred' : 'local';
const defaultAutoOpenBrowser = distributionMode ? true : false;

const appConfig = {
  distributionMode,
  port: readIntEnv('PORT', 3000, { min: 0 }),
  host: readStringEnv('HOST', '0.0.0.0'),
  startMode: normalizeStartMode(
    readStringEnv('APP_START_MODE', hasStartModeOverride ? 'online-preferred' : defaultStartMode)
  ),
  autoOpenBrowser: hasAutoOpenOverride
    ? readBoolEnv('AUTO_OPEN_BROWSER', defaultAutoOpenBrowser)
    : defaultAutoOpenBrowser,
  publicProtocol: readStringEnv('PUBLIC_PROTOCOL', ''),
  publicHost: readStringEnv('PUBLIC_HOST', ''),
  publicPort: readIntEnv('PUBLIC_PORT', null, { min: 1 }),
  sharePort: readIntEnv('SHARE_PORT', null, { min: 1 })
};

module.exports = {
  appConfig
};
