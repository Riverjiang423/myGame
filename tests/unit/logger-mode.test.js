const test = require('node:test');
const assert = require('node:assert/strict');
const { createAppLogger } = require('../../src/bootstrap/logger');

function captureConsole() {
  const logs = [];
  const warns = [];
  const errors = [];
  const original = {
    log: console.log,
    warn: console.warn,
    error: console.error
  };

  console.log = (...args) => {
    logs.push(args.map((x) => String(x)).join(' '));
  };
  console.warn = (...args) => {
    warns.push(args.map((x) => String(x)).join(' '));
  };
  console.error = (...args) => {
    errors.push(args.map((x) => String(x)).join(' '));
  };

  return {
    logs,
    warns,
    errors,
    restore() {
      console.log = original.log;
      console.warn = original.warn;
      console.error = original.error;
    }
  };
}

test('logger in development mode prints debug logs', () => {
  const capture = captureConsole();
  try {
    const logger = createAppLogger({ distributionMode: false });
    logger.debug('debug message');
    assert.ok(capture.logs.some((line) => line.includes('[debug] debug message')));
  } finally {
    capture.restore();
  }
});

test('logger in distribution mode suppresses debug logs', () => {
  const capture = captureConsole();
  try {
    const logger = createAppLogger({ distributionMode: true });
    logger.debug('debug message');
    assert.equal(capture.logs.some((line) => line.includes('[debug]')), false);
  } finally {
    capture.restore();
  }
});
