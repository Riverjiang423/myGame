function readStringEnv(name, defaultValue = '') {
  const raw = process.env[name];
  if (raw === undefined || raw === null) {
    return defaultValue;
  }
  const normalized = String(raw).trim();
  return normalized.length > 0 ? normalized : defaultValue;
}

function readIntEnv(name, defaultValue, options = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return defaultValue;
  }

  const n = Number(raw);
  if (!Number.isInteger(n)) {
    return defaultValue;
  }

  if (Number.isInteger(options.min) && n < options.min) {
    return defaultValue;
  }

  if (Number.isInteger(options.max) && n > options.max) {
    return defaultValue;
  }

  return n;
}

function readBoolEnv(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return defaultValue;
  }
  const normalized = String(raw).trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

module.exports = {
  readStringEnv,
  readIntEnv,
  readBoolEnv
};
